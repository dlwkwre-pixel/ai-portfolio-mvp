"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageIntro from "@/app/components/page-intro";
import MasterLifeRoadmap, { type RoadmapEvent, type RoadmapMilestone, type TrajectoryPoint } from "./master-life-roadmap";
import XLSXStyle from "xlsx-js-style";
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
  trimNetWorthHistoryBefore,
  upsertPlanningAssumptions,
  addFutureEvent,
  deleteFutureEvent,
} from "./planning-actions";
import type { FinancialProfile, ProfileKid, BalanceSheetItem, CashFlowItem, NetWorthSnapshot, PlanningAssumptions, FutureEvent, ExpenseActual, EstateProfile, EstateBeneficiary, EstateAccount, BudgetHistoryEntry } from "./planning-actions";
import { logExpenseActual, moveMerchantActual, syncForecastToActuals, upsertEstateProfile, upsertEstateBeneficiaries, upsertEstateAccounts, upsertFamilyInstructions, setCashFlowItemCategory } from "./planning-actions";
import type { HomeScenario } from "./home/home-actions";
import type { CareerScenario } from "./career/career-actions";
import type { EducationScenario } from "./education/education-actions";
import type { FamilyScenario } from "./family/family-actions";
import type { SabbaticalScenario } from "./sabbatical/sabbatical-actions";
import type { CarScenario } from "./car/car-actions";
import type { ApartmentListing } from "./apartment/apartment-actions";
import Link from "next/link";
import type { FinnContext } from "@/app/api/planning/finn/route";
import type { FinnChatMessage, FinnChatContext } from "@/app/api/planning/finn/chat/route";
import type { ImportedItem } from "@/app/api/planning/import/route";
import { estimateTax, US_STATES, FILING_STATUS_LABELS, INCOME_TYPE_LABELS, retirementFederalTax, retirementStateTax } from "@/lib/tax/estimator";
import { contributionLimits, iraLimitForAge } from "@/lib/tax/contribution-limits";
import { compute401k } from "@/lib/tax/retirement-401k";
import Plan401kSection from "./plan-401k-section";
import type { FilingStatus, IncomeType } from "@/lib/tax/estimator";

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
const FREQ_TO_MONTHLY: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};
const FREQ_SUFFIX: Record<string, string> = {
  weekly: "wk", biweekly: "2wk", semimonthly: "½mo", monthly: "mo", quarterly: "qtr", annual: "yr",
};
const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly", biweekly: "Every 2 weeks", semimonthly: "Twice a month",
  monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
};
const FREQ_OPTIONS = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "annual"] as const;

function toMonthly(amount: number, frequency: string) {
  return amount * (FREQ_TO_MONTHLY[frequency] ?? 1);
}
function freqSuffix(frequency: string): string {
  return FREQ_SUFFIX[frequency] ?? "mo";
}
function getEffectiveBudget(
  budgetHistory: BudgetHistoryEntry[],
  itemId: string,
  year: number,
  month: number
): number | null {
  const entries = budgetHistory
    .filter(h => h.item_id === itemId &&
      (h.effective_year < year || (h.effective_year === year && h.effective_month <= month)))
    .sort((a, b) => b.effective_year !== a.effective_year ? b.effective_year - a.effective_year : b.effective_month - a.effective_month);
  return entries.length > 0 ? entries[0].amount : null;
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
  estateDocsComplete: number = 0,
  effectiveIncome: number = 0,
  retirementProb: number | null = null,
) {
  type Dir = "strength" | "weakness" | "neutral";
  const dir = (s: number, hi: number, lo: number): Dir => s >= hi ? "strength" : s >= lo ? "neutral" : "weakness";

  // Domain 1: Cash Flow (0-20). Savings rate ≥ 20% = full marks.
  const cfScore = Math.min(20, (savingsRate / 20) * 20);
  const cfMetric = effectiveIncome > 0 ? `${savingsRate.toFixed(0)}% savings rate` : "No income data";
  const cfAction = savingsRate >= 20 ? "On target" : effectiveIncome > 0 ? `Need ${fmt(Math.round(Math.max(0, effectiveIncome * 0.20 - monthlyNetWorth)))}/mo more` : "Add income & expenses";

  // Domain 2: Liquidity (0-20). 3-month emergency fund = full marks.
  const efMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0;
  const liqScore = Math.min(20, (efMonths / 3) * 20);
  const liqMetric = monthlyExpenses > 0 ? `${efMonths.toFixed(1)} months covered` : "Add expenses";
  const liqAction = efMonths >= 3 ? "Emergency fund healthy" : monthlyExpenses > 0 ? `Build ${fmt(Math.round(Math.max(0, monthlyExpenses * 3 - liquidAssets)))} more` : "Set monthly expenses";

  // Domain 3: Debt (0-20). Zero liabilities = full marks; debt/assets ≤ 30% = near full.
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : (totalLiabilities > 0 ? 1 : 0);
  const debtScore = Math.min(20, Math.max(0, (1 - debtRatio) * 20));
  const debtMetric = totalAssets > 0 ? `${Math.round(debtRatio * 100)}% debt-to-assets` : totalLiabilities === 0 ? "No debt tracked" : "Add assets";
  const debtAction = totalLiabilities === 0 ? "Debt-free" : debtRatio <= 0.3 ? "Low debt load" : debtRatio <= 0.6 ? "Moderate — reduce debt" : "High debt — priority focus";

  // Domain 4: Retirement (0-20). Trajectory + probability.
  let retirScore = 0;
  if (retirementProb != null) {
    retirScore = Math.min(20, (retirementProb / 100) * 20);
  } else if (currentAge != null && targetRetirementAge != null && targetRetirementAge > currentAge) {
    const yearsLeft = targetRetirementAge - currentAge;
    if (monthlyNetWorth > 0) {
      const projected = monthlyNetWorth * 12 * yearsLeft;
      const target = monthlyExpenses * 12 * 25;
      retirScore = target > 0 ? Math.min(20, (projected / target) * 20) : 10;
    }
  } else if (monthlyNetWorth > 0) {
    retirScore = 10;
  }
  const retirMetric = retirementProb != null ? `${retirementProb}% on track` : currentAge != null && targetRetirementAge != null ? "Forecast unavailable" : "Set retirement age";
  const retirAction = retirementProb != null ? (retirementProb >= 80 ? "On track for retirement" : retirementProb >= 60 ? `${80 - retirementProb}pp gap — increase savings` : "Retirement needs attention") : "Add profile for analysis";

  // Domain 5: Estate (0-20). 6 core docs complete = full marks; partial credit per doc.
  const estScore = Math.min(20, Math.round((estateDocsComplete / 6) * 20));
  const estMetric = estateDocsComplete > 0 ? `${estateDocsComplete}/6 core documents` : "Not started";
  const estAction = estateDocsComplete === 0 ? "Start with a will" : estateDocsComplete < 4 ? "Complete key documents" : estateDocsComplete < 6 ? "Nearly complete" : "Estate plan in order";

  return {
    total: Math.round(cfScore + liqScore + debtScore + retirScore + estScore),
    factors: [
      { name: "Cash Flow",  score: Math.round(cfScore),    max: 20, direction: dir(cfScore, 16, 8),    metric: cfMetric,    action: cfAction,    tabKey: "cashflow" },
      { name: "Liquidity",  score: Math.round(liqScore),   max: 20, direction: dir(liqScore, 16, 8),   metric: liqMetric,   action: liqAction,   tabKey: "balance"  },
      { name: "Debt",       score: Math.round(debtScore),  max: 20, direction: dir(debtScore, 16, 8),  metric: debtMetric,  action: debtAction,  tabKey: "balance"  },
      { name: "Retirement", score: Math.round(retirScore), max: 20, direction: dir(retirScore, 16, 8), metric: retirMetric, action: retirAction, tabKey: "forecast" },
      { name: "Estate",     score: Math.round(estScore),   max: 20, direction: dir(estScore, 16, 8),   metric: estMetric,   action: estAction,   tabKey: "estate"   },
    ] as { name: string; score: number; max: number; direction: "strength" | "weakness" | "neutral"; metric: string; action: string; tabKey: string }[],
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
    const eventImpact = futureEvents.reduce((s, e) => {
      let v = e.event_year === yearAbs ? e.amount_impact : 0;
      const rec = e.recurring_annual ?? 0;
      if (rec && yearAbs >= e.event_year && (e.end_year == null || yearAbs <= e.end_year)) v += rec;
      return s + v;
    }, 0);

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

function calcRetirementProbability(baselineNW: number, annualExpenses: number, annualOtherIncome = 0): number | null {
  // Net guaranteed retirement income (Social Security, pensions) against spending —
  // you only need the portfolio to cover the gap (the 25x rule on net expenses).
  const netExpenses = Math.max(0, annualExpenses - Math.max(0, annualOtherIncome));
  if (netExpenses <= 0) return baselineNW > 0 ? 95 : null; // income alone covers expenses
  if (baselineNW <= 0) return null;
  const ratio = baselineNW / (netExpenses * 25);
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
      const yearAbsMc = currentYear + y;
      const events = futureEvents.reduce((s, e) => {
        let v = e.event_year === yearAbsMc ? e.amount_impact : 0;
        const rec = e.recurring_annual ?? 0;
        if (rec && yearAbsMc >= e.event_year && (e.end_year == null || yearAbsMc <= e.end_year)) v += rec;
        return s + v;
      }, 0);
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

// ── Retirement drawdown engine ─────────────────────────────────────────────────
// The forecast above is accumulation-only and stops at retirement. This simulates
// the SPENDING phase: each year guaranteed income (Social Security) covers what it
// can, RMDs are forced from tax-deferred accounts at 73+, and the remaining need is
// pulled in tax-smart order — taxable first, then tax-deferred, then Roth — so the
// most-taxed and RMD-exposed money is spent before tax-free money is touched.
//
// v1 tax model (simplified, bucket-differentiated, clearly an estimate):
//   • tax-deferred withdrawals + RMDs taxed at an ordinary effective rate
//   • taxable-account withdrawals taxed at a low effective (gains) rate
//   • Roth withdrawals tax-free
//   • Social Security treated as net (after-tax) — most retirees pay little on it
// Upgrade path: full federal brackets, SS provisional-income taxation, state tax.

// IRS Uniform Lifetime Table (2022+) — divisor by age for required minimum distributions.
const RMD_DIVISORS: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
  89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
  97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9,
  105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
};
function rmdDivisor(age: number): number | null {
  if (age < 73) return null;
  if (age >= 110) return 3.5;
  return RMD_DIVISORS[age] ?? null;
}

type DrawdownYear = {
  age: number;
  expenses: number;        // total spending incl. healthcare/LTC
  healthcare: number;      // healthcare + LTC portion of expenses
  guaranteedIncome: number;
  rmd: number;
  conversion: number;      // Roth conversion this year
  withdrawal: number;      // gross withdrawn from all buckets (incl. RMD)
  taxes: number;
  taxable: number;         // end-of-year balances
  taxDeferred: number;
  taxFree: number;
  total: number;
  shortfall: number;       // unmet spending need this year
};
type DrawdownResult = {
  years: DrawdownYear[];
  depletedAge: number | null;  // first age spending could not be fully met
  lastsToAge: number;          // last age fully funded
  success: boolean;            // funded through endAge
  endAge: number;
  totalTaxes: number;
  totalRmds: number;
  totalConversions: number;
  startTotal: number;
};

type DrawdownParams = {
  startTaxable: number;
  startTaxDeferred: number;
  startTaxFree: number;
  currentAge: number;
  retirementAge: number;
  endAge?: number;
  annualExpensesAtRetirement: number; // nominal, inflated to the retirement year
  inflationRate: number;
  returnRate: number;
  socialSecurityAnnualToday: number;  // today's dollars
  claimAge: number;
  filing: FilingStatus;
  stateCode?: string;                 // for state income tax on retirement income
  startTaxableBasis?: number;         // cost basis of the taxable bucket at retirement (for real cap-gains)
  taxableGainsFraction?: number;      // fallback embedded-gains fraction if no basis provided
  // Roth conversions (convert tax-deferred → Roth in low-income years to fill a bracket)
  rothConversions?: boolean;
  conversionFillToTaxable?: number;   // target ordinary TAXABLE income to fill via conversions
  conversionUntilAge?: number;        // stop converting at this age (default = RMD age 73)
  // Healthcare / long-term care
  annualHealthcareToday?: number;     // today's dollars; grows at healthcareInflation
  healthcareInflation?: number;       // default 5%
  ltcAnnualToday?: number;            // today's dollars, added during the LTC window
  ltcStartAge?: number;
  ltcYears?: number;
};

// Shared simulation core — `getReturn(yearIndex)` supplies the annual return so the
// deterministic projection and the Monte Carlo both run the exact same tax/withdrawal logic.
function drawdownCore(p: DrawdownParams, getReturn: (yearIndex: number) => number): DrawdownResult | null {
  const endAge = p.endAge ?? 95;
  if (p.retirementAge >= endAge) return null;
  if (p.annualExpensesAtRetirement <= 0) return null;

  const convUntil = p.conversionUntilAge ?? 73;
  const hcInflation = p.healthcareInflation ?? 0.05;

  let taxable = Math.max(0, p.startTaxable);
  let taxDeferred = Math.max(0, p.startTaxDeferred);
  let taxFree = Math.max(0, p.startTaxFree);
  // Cost basis of the taxable bucket — only the gains portion of a withdrawal is taxed.
  // Defaults to the provided basis, else assumes a moderate embedded-gains fraction.
  let taxableBasis = Math.min(taxable, Math.max(0, p.startTaxableBasis ?? taxable * (1 - (p.taxableGainsFraction ?? 0.35))));
  const startTotal = taxable + taxDeferred + taxFree;
  if (startTotal <= 0) return null;

  const years: DrawdownYear[] = [];
  let depletedAge: number | null = null;
  let totalTaxes = 0, totalRmds = 0, totalConversions = 0;

  for (let age = p.retirementAge; age <= endAge; age++) {
    const yIdx = age - p.retirementAge;
    const yFromRet = yIdx;
    const yFromToday = Math.max(0, age - p.currentAge);

    // Spending: base + healthcare (grows faster) + LTC window
    const baseExpenses = p.annualExpensesAtRetirement * Math.pow(1 + p.inflationRate, yFromRet);
    const healthcare = (p.annualHealthcareToday ?? 0) > 0 ? p.annualHealthcareToday! * Math.pow(1 + hcInflation, yFromToday) : 0;
    const inLtc = (p.ltcAnnualToday ?? 0) > 0 && p.ltcStartAge != null && age >= p.ltcStartAge && age < p.ltcStartAge + (p.ltcYears ?? 0);
    const ltc = inLtc ? p.ltcAnnualToday! * Math.pow(1 + hcInflation, yFromToday) : 0;
    const expenses = baseExpenses + healthcare + ltc;
    const ss = age >= p.claimAge ? p.socialSecurityAnnualToday * Math.pow(1 + p.inflationRate, yFromToday) : 0;

    // 1) Required Minimum Distribution (forced ordinary income)
    let rmd = 0;
    const div = rmdDivisor(age);
    if (div != null && taxDeferred > 0) { rmd = taxDeferred / div; taxDeferred -= rmd; totalRmds += rmd; }

    // 2) Roth conversion — fill ordinary income up to a target taxable level in low-income years
    let conversion = 0;
    if (p.rothConversions && age < convUntil && taxDeferred > 0 && (p.conversionFillToTaxable ?? 0) > 0) {
      const std = STD_DEDUCTION_BY_FILING[p.filing];
      const taxableSSApprox = 0; // pre-claim or low income → little SS taxation; conservative
      const ordinarySoFar = rmd + taxableSSApprox;
      const targetOrdinary = (p.conversionFillToTaxable ?? 0) + std; // gross ordinary income to hit target taxable
      conversion = Math.max(0, Math.min(taxDeferred, targetOrdinary - ordinarySoFar));
      if (conversion > 0) { taxDeferred -= conversion; taxFree += conversion; totalConversions += conversion; }
    }

    // 3) Solve the year: withdraw (taxable → deferred → Roth) enough to cover expenses + taxes.
    //    Taxes depend on income composition (incl. real cap gains + state tax), so iterate.
    //    The taxable bucket's gains fraction at this moment drives its capital gains.
    const gainsFracNow = taxable > 0 ? Math.max(0, Math.min(1, (taxable - taxableBasis) / taxable)) : 0;
    let wdTaxable = 0, wdDeferred = 0, wdRoth = 0;
    let depletedThisYear = false;
    let finalTax = 0;
    for (let iter = 0; iter < 12; iter++) {
      const ordinaryIncome = rmd + conversion + wdDeferred;
      const capitalGains = wdTaxable * gainsFracNow;
      const fed = retirementFederalTax({ ordinaryIncome, capitalGains, socialSecurity: ss, filing: p.filing }).totalTax;
      // State tax on retirement income (ordinary + gains; SS excluded, as most states do).
      const st = p.stateCode ? retirementStateTax(ordinaryIncome + capitalGains, p.stateCode, p.filing) : 0;
      finalTax = fed + st;
      const cashIn = ss + rmd + wdTaxable + wdDeferred + wdRoth;
      const gap = expenses + finalTax - cashIn;
      if (gap <= 0.5) break;
      let need = gap;
      const tCap = taxable - wdTaxable; const t1 = Math.min(need, Math.max(0, tCap)); wdTaxable += t1; need -= t1;
      if (need > 0) { const dCap = taxDeferred - wdDeferred; const t2 = Math.min(need, Math.max(0, dCap)); wdDeferred += t2; need -= t2; }
      if (need > 0) { const rCap = taxFree - wdRoth; const t3 = Math.min(need, Math.max(0, rCap)); wdRoth += t3; need -= t3; }
      if (need > 0.5) { depletedThisYear = true; break; }
    }

    // Apply withdrawals. The taxable withdrawal draws down basis pro-rata with gains.
    if (wdTaxable > 0) { taxableBasis -= wdTaxable * (1 - gainsFracNow); }
    taxable -= wdTaxable; taxDeferred -= wdDeferred; taxFree -= wdRoth;
    const cashIn = ss + rmd + wdTaxable + wdDeferred + wdRoth;
    const shortfall = depletedThisYear ? Math.max(0, expenses + finalTax - cashIn) : 0;
    if (shortfall > 0.5 && depletedAge == null) depletedAge = age;
    // Forced RMD (or any) surplus after covering spending + tax is reinvested into taxable (all basis).
    const surplus = cashIn - finalTax - expenses;
    if (surplus > 0.5) { taxable += surplus; taxableBasis += surplus; }
    totalTaxes += finalTax;

    // 4) Grow remaining balances for the year (growth adds gains, not basis)
    const r = getReturn(yIdx);
    taxable = Math.max(0, taxable) * (1 + r);
    taxableBasis = Math.max(0, Math.min(taxableBasis, taxable));
    taxDeferred = Math.max(0, taxDeferred) * (1 + r);
    taxFree = Math.max(0, taxFree) * (1 + r);
    const total = taxable + taxDeferred + taxFree;

    years.push({
      age, expenses: Math.round(expenses), healthcare: Math.round(healthcare + ltc),
      guaranteedIncome: Math.round(ss), rmd: Math.round(rmd), conversion: Math.round(conversion),
      withdrawal: Math.round(rmd + wdTaxable + wdDeferred + wdRoth), taxes: Math.round(finalTax),
      taxable: Math.round(taxable), taxDeferred: Math.round(taxDeferred), taxFree: Math.round(taxFree),
      total: Math.round(total), shortfall: Math.round(shortfall),
    });
  }

  const lastsToAge = depletedAge != null ? depletedAge - 1 : endAge;
  return {
    years, depletedAge, lastsToAge, success: depletedAge == null, endAge,
    totalTaxes: Math.round(totalTaxes), totalRmds: Math.round(totalRmds),
    totalConversions: Math.round(totalConversions), startTotal: Math.round(startTotal),
  };
}

// Standard deduction by filing status (kept in sync with the estimator; used for conversion targeting).
const STD_DEDUCTION_BY_FILING: Record<FilingStatus, number> = {
  single: 15_000, married_filing_jointly: 30_000, head_of_household: 22_500, married_filing_separately: 15_000,
};

// Top of the 12% federal bracket (2025) — the usual ceiling to fill with Roth conversions
// in low-income early-retirement years (stay in the 10–12% bracket, avoid the 22% jump).
const TWELVE_PCT_BRACKET_TOP: Record<FilingStatus, number> = {
  single: 48_475, married_filing_jointly: 96_950, head_of_household: 64_850, married_filing_separately: 48_475,
};
// Top of the 22% bracket — a more aggressive conversion ceiling.
const TWENTY_TWO_PCT_BRACKET_TOP: Record<FilingStatus, number> = {
  single: 103_350, married_filing_jointly: 206_700, head_of_household: 103_350, married_filing_separately: 103_350,
};

// Deterministic drawdown (constant return).
function simulateRetirementDrawdown(p: DrawdownParams): DrawdownResult | null {
  return drawdownCore(p, () => p.returnRate);
}

// Monte Carlo drawdown — runs the same engine with random annual returns. Success = the
// portfolio never fails to fund spending before endAge (a far stronger test than "25× at retirement").
function runDrawdownMonteCarlo(p: DrawdownParams, runs = 400): {
  successRate: number; medianEndBalance: number; p10EndBalance: number; medianDepletionAge: number | null;
} | null {
  const base = drawdownCore(p, () => p.returnRate);
  if (!base) return null;
  let successes = 0;
  const endBalances: number[] = [];
  const depletionAges: number[] = [];
  for (let i = 0; i < runs; i++) {
    const res = drawdownCore(p, () => Math.max(-0.6, normalRandom(p.returnRate, 0.15)));
    if (!res) continue;
    if (res.success) successes++; else depletionAges.push(res.depletedAge!);
    endBalances.push(res.years[res.years.length - 1]?.total ?? 0);
  }
  const n = endBalances.length || 1;
  endBalances.sort((a, b) => a - b);
  depletionAges.sort((a, b) => a - b);
  return {
    successRate: Math.round((successes / (endBalances.length || 1)) * 100),
    medianEndBalance: endBalances[Math.floor(n / 2)] ?? 0,
    p10EndBalance: endBalances[Math.floor(n * 0.1)] ?? 0,
    medianDepletionAge: depletionAges.length > 0 ? depletionAges[Math.floor(depletionAges.length / 2)] : null,
  };
}

// ── Plan spine: one source of truth for life events the forecast consumes ──────
// Expands committed planner scenarios into per-year FutureEvent drags so that
// modeling a child, college, etc. actually moves the master forecast — not just
// triggers a conflict alert. Manual future events pass through unchanged.
// Planners without a stored target year (home/car/career/sabbatical) are added
// to the plan explicitly elsewhere; only year-derivable scenarios are auto-collected here.
function collectLifeEvents(args: {
  futureEvents: FutureEvent[];
  familyScenarios: FamilyScenario[];
  educationScenarios: EducationScenario[];
  currentYear: number;
  horizonYears: number;
}): FutureEvent[] {
  const { futureEvents, familyScenarios, educationScenarios, currentYear, horizonYears } = args;
  const endYear = currentYear + horizonYears;
  const out: FutureEvent[] = [...futureEvents];
  let synth = 0;
  const mk = (label: string, year: number, impact: number, category: string): FutureEvent => ({
    id: `spine-${category}-${synth++}`, user_id: "", label, event_year: year, amount_impact: Math.round(impact), category, sort_order: 0,
  });

  // Family: annual childcare cost from the child's current age until 18 (age-banded).
  for (const s of familyScenarios) {
    const startAge = Math.max(0, Number(s.child_current_age) || 0);
    for (let age = startAge; age < 18; age++) {
      const yr = currentYear + (age - startAge);
      if (yr <= currentYear || yr > endYear) continue; // y=0 isn't applied by the forecast
      const monthly = age < 3 ? Number(s.monthly_infant_cost)
        : age <= 12 ? Number(s.monthly_child_cost)
        : Number(s.monthly_teen_cost);
      const annual = (monthly || 0) * 12;
      if (annual > 0) out.push(mk(`${s.child_name ?? "Child"} care`, yr, -annual, "family"));
    }
  }

  // Education: inflated annual tuition across the college years.
  for (const s of educationScenarios) {
    const yearsUntilCollege = Math.max(0, 18 - (Number(s.child_current_age) || 0));
    const collegeStart = currentYear + yearsUntilCollege;
    for (let i = 0; i < (Number(s.years_in_college) || 0); i++) {
      const yr = collegeStart + i;
      if (yr <= currentYear || yr > endYear) continue;
      const inflated = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yr - currentYear);
      if (inflated > 0) out.push(mk(`${s.child_name ?? "College"} tuition`, yr, -inflated, "education"));
    }
  }

  return out;
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

// ── Command Center helpers ─────────────────────────────────────────────────────

type SystemSection = {
  id: string; label: string; tabKey: string;
  complete: number; total: number; pct: number;
  status: "complete" | "partial" | "empty"; cta: string;
};

function computeSystemHealth(p: {
  profile: FinancialProfile | null;
  assets: BalanceSheetItem[];
  liabilities: BalanceSheetItem[];
  cashFlowItems: CashFlowItem[];
  homeScenarios: HomeScenario[];
  familyScenarios: FamilyScenario[];
  careerScenarios: CareerScenario[];
  educationScenarios: EducationScenario[];
  estateProfile: EstateProfile | null;
}): SystemSection[] {
  const prof = [
    p.profile?.date_of_birth != null,
    p.profile?.target_retirement_age != null,
    p.cashFlowItems.some((i) => i.type === "income") || (p.profile?.gross_monthly_income ?? 0) > 0,
    p.cashFlowItems.some((i) => i.type === "expense") || (p.profile?.monthly_expenses ?? 0) > 0,
  ].filter(Boolean).length;
  const bal = [p.assets.length > 0, p.liabilities.length > 0].filter(Boolean).length;
  const cf = [
    p.cashFlowItems.some((i) => i.type === "income"),
    p.cashFlowItems.some((i) => i.type === "expense"),
  ].filter(Boolean).length;
  const life = [
    p.homeScenarios.length > 0, p.familyScenarios.length > 0,
    p.careerScenarios.length > 0, p.educationScenarios.length > 0,
  ].filter(Boolean).length;
  const ep = p.estateProfile;
  const est = ep ? [ep.doc_will, ep.doc_living_trust, ep.doc_durable_poa, ep.doc_healthcare_directive, ep.doc_beneficiary_desig, ep.doc_digital_assets].filter((d) => d !== "none").length : 0;
  const s = (c: number, t: number): "complete" | "partial" | "empty" => c === 0 ? "empty" : c >= t ? "complete" : "partial";
  return [
    { id: "profile",  label: "Profile",          tabKey: "overview", complete: prof, total: 4, pct: Math.round(prof / 4 * 100),  status: s(prof, 4),  cta: "Set up profile"  },
    { id: "balance",  label: "Balance Sheet",     tabKey: "balance",  complete: bal,  total: 2, pct: Math.round(bal / 2 * 100),   status: s(bal, 2),   cta: "Add assets"      },
    { id: "cashflow", label: "Cash Flow",         tabKey: "cashflow", complete: cf,   total: 2, pct: Math.round(cf / 2 * 100),    status: s(cf, 2),    cta: "Set up"          },
    { id: "life",     label: "Life Planning",     tabKey: "events",   complete: life, total: 4, pct: Math.round(life / 4 * 100),  status: s(life, 4),  cta: "Model decisions" },
    { id: "estate",   label: "Estate Readiness",  tabKey: "estate",   complete: est,  total: 6, pct: Math.round(est / 6 * 100),   status: s(est, 6),   cta: "Track docs"      },
  ];
}

type CommandPriority = {
  id: string; rank: number; title: string; why: string;
  impact: string; tabKey: string; ctaLabel: string; urgent: boolean;
};

function computeCommandPriorities(p: {
  profile: FinancialProfile | null;
  savingsRate: number; monthlySavings: number;
  effectiveIncome: number; effectiveExpenses: number;
  liquidAssets: number; netWorth: number;
  totalAssets: number; totalLiabilities: number;
  retirementProb: number | null; yearsToRetire: number | null;
  cashFlowItems: CashFlowItem[];
  homeScenarios: HomeScenario[];
  familyScenarios: FamilyScenario[];
  careerScenarios: CareerScenario[];
  educationScenarios: EducationScenario[];
  estateProfile: EstateProfile | null;
  localReturn: number;
}): CommandPriority[] {
  const items: CommandPriority[] = [];
  let r = 1;
  const hasProfile = p.profile?.current_age != null;
  const hasIncome = p.effectiveIncome > 0;

  if (!hasProfile) {
    items.push({ id: "setup-profile", rank: r++, urgent: true, tabKey: "overview", ctaLabel: "Set up profile",
      title: "Complete your financial profile",
      why: "Age, income, and retirement target unlock health score, forecast, and all AI-driven guidance.",
      impact: "Unlocks all 5 planning modules",
    });
  }
  if (p.cashFlowItems.length === 0 && hasIncome) {
    items.push({ id: "setup-cashflow", rank: r++, urgent: true, tabKey: "cashflow", ctaLabel: "Set up cash flow",
      title: "Add income & expense line items",
      why: "Savings rate, budget tracking, and spending insights are blind without detailed cash flow data.",
      impact: "Enables real-time savings rate tracking",
    });
  }
  if (hasIncome && p.savingsRate >= 0 && p.savingsRate < 20) {
    const gap = Math.max(50, p.effectiveIncome * 0.20 - p.monthlySavings);
    const ytr = p.yearsToRetire ?? 25;
    const compounded = p.localReturn > 0
      ? Math.round(gap * 12 * ((Math.pow(1 + p.localReturn, ytr) - 1) / p.localReturn))
      : Math.round(gap * 12 * ytr);
    items.push({ id: "savings-rate", rank: r++, urgent: p.savingsRate < 5, tabKey: "cashflow", ctaLabel: "Review cash flow",
      title: `Raise savings rate to 20% (+${fmt(gap)}/mo)`,
      why: `At ${p.savingsRate.toFixed(1)}%, compounding is limited. The gap to 20% represents ${ytr} years of missed growth.`,
      impact: `+${fmt(compounded)} projected at retirement`,
    });
  }
  const emergencyTarget = p.effectiveExpenses * 3;
  const emergencyMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 0;
  if (p.effectiveExpenses > 0 && emergencyMonths < 3) {
    const gap = Math.max(0, emergencyTarget - p.liquidAssets);
    items.push({ id: "emergency-fund", rank: r++, urgent: emergencyMonths < 1, tabKey: "balance", ctaLabel: "View balance sheet",
      title: `Build ${fmt(gap)} emergency fund`,
      why: `${emergencyMonths.toFixed(1)} months of expenses covered. Under 3 months forces investment liquidation in a crisis.`,
      impact: "+25 Financial Health Score points",
    });
  }
  if (p.homeScenarios.length === 0) {
    items.push({ id: "model-home", rank: r++, urgent: false, tabKey: "events", ctaLabel: "Open Home Planner",
      title: "Model a home purchase",
      why: "A home is the largest financial decision most people make. Modeling reveals the true lifetime cost vs. renting.",
      impact: "Reveals exact retirement impact",
    });
  }
  if (p.retirementProb != null && p.retirementProb < 65 && hasProfile) {
    items.push({ id: "retirement-gap", rank: r++, urgent: p.retirementProb < 40, tabKey: "forecast", ctaLabel: "Open forecast",
      title: "Close retirement probability gap",
      why: `At ${Math.round(p.retirementProb)}%, you are likely to fall short of 25× annual expenses. The Forecast tab shows the highest-leverage levers.`,
      impact: `${Math.round(p.retirementProb)}% → target 80%+`,
    });
  }
  const ep = p.estateProfile;
  const estDone = ep ? [ep.doc_will, ep.doc_living_trust, ep.doc_durable_poa, ep.doc_healthcare_directive, ep.doc_beneficiary_desig, ep.doc_digital_assets].filter((d) => d !== "none").length : 0;
  if (estDone < 2) {
    items.push({ id: "estate", rank: r++, urgent: false, tabKey: "estate", ctaLabel: "Review estate",
      title: "Complete estate readiness",
      why: "Without a will and power of attorney, key decisions may be left to courts. Most people delay until it is too late.",
      impact: "Protects your family in any scenario",
    });
  }
  if (p.careerScenarios.length === 0) {
    items.push({ id: "model-career", rank: r++, urgent: false, tabKey: "events", ctaLabel: "Open Career Planner",
      title: "Model a career change",
      why: "A career move can be the single largest income multiplier available. Compare lifetime trajectories before deciding.",
      impact: "Reveals lifetime income differential",
    });
  }

  return items.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.rank - b.rank).slice(0, 5);
}

// ── Conflict Detection Engine ─────────────────────────────────────────────────

export type ConflictAlert = {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation: string;
  tabKey: string;
  years: number[];
};

function computeConflictAlerts(p: {
  homeScenarios: HomeScenario[];
  familyScenarios: FamilyScenario[];
  educationScenarios: EducationScenario[];
  careerScenarios: CareerScenario[];
  futureEvents: FutureEvent[];
  profile: FinancialProfile | null;
  currentYear: number;
  monthlySavings: number;
  liquidAssets: number;
  effectiveExpenses: number;
  retirementProb: number | null;
}): ConflictAlert[] {
  const alerts: ConflictAlert[] = [];
  const cy = p.currentYear;

  type Ev = { year: number; label: string; cost: number; source: string };
  const events: Ev[] = [];

  for (const s of p.familyScenarios) {
    const monthly = s.child_current_age < 3 ? Number(s.monthly_infant_cost) : s.child_current_age <= 12 ? Number(s.monthly_child_cost) : Number(s.monthly_teen_cost);
    events.push({ year: cy, label: s.child_name ?? s.name, cost: monthly * 12, source: "family" });
  }
  for (const s of p.educationScenarios) {
    const yu = Math.max(0, 18 - s.child_current_age);
    const futureAnnual = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yu);
    events.push({ year: cy + yu, label: `${s.child_name ?? "College"} tuition`, cost: futureAnnual * s.years_in_college, source: "education" });
  }
  for (const e of p.futureEvents) {
    if (e.amount_impact < 0) events.push({ year: e.event_year, label: e.label, cost: Math.abs(e.amount_impact), source: e.category ?? "event" });
  }

  // Detect: events clustered within a 2-year window
  const windowYears = 2;
  type Window = { startYear: number; events: Ev[]; totalCost: number; sources: Set<string> };
  const windows: Window[] = [];
  const futureEvs = events.filter((e) => e.year >= cy && e.year <= cy + 20);
  const years = [...new Set(futureEvs.map((e) => e.year))].sort((a, b) => a - b);
  for (const y of years) {
    const inWindow = futureEvs.filter((e) => e.year >= y && e.year < y + windowYears);
    if (inWindow.length >= 2) {
      windows.push({ startYear: y, events: inWindow, totalCost: inWindow.reduce((s, e) => s + e.cost, 0), sources: new Set(inWindow.map((e) => e.source)) });
    }
  }
  windows.sort((a, b) => b.totalCost - a.totalCost);
  if (windows.length > 0) {
    const w = windows[0];
    if (w.sources.size >= 2 && w.totalCost > 15000) {
      const severity = w.totalCost > 100000 ? "critical" : "warning";
      const labels = [...new Set(w.events.map((e) => e.label))].slice(0, 3).join(", ");
      alerts.push({
        severity,
        title: `${w.sources.size} major cost categories overlap in ${w.startYear}–${w.startYear + windowYears - 1}`,
        description: `${labels} — totaling approximately ${fmt(Math.round(w.totalCost))} — concentrate within a 2-year window. Combined, these create significant cash flow pressure.`,
        recommendation: "Consider staggering major events where possible, or build a dedicated buffer of at least 3–6 months of total costs before this period.",
        tabKey: "events",
        years: [w.startYear, w.startYear + 1],
      });
    }
  }

  // Detect: home purchase event + child overlap
  const homeEvents = p.futureEvents.filter((e) => ["home_purchase", "home"].includes(e.category ?? ""));
  for (const he of homeEvents) {
    const childInfants = p.familyScenarios.filter((s) => s.child_current_age <= 2);
    if (childInfants.length > 0) {
      alerts.push({
        severity: "warning",
        title: "Home purchase + infant costs in same period",
        description: `A home purchase event coincides with infant-stage child expenses. These are two of the highest-cost life events — occurring simultaneously strains both liquidity and monthly cash flow.`,
        recommendation: "Model both in the forecast to see the combined monthly obligation. Ensure liquid assets cover at least 6 months of combined costs before committing.",
        tabKey: "events",
        years: [he.event_year],
      });
    }
  }

  // Detect: large events within 5 years of retirement
  if (p.profile?.current_age != null && p.profile.target_retirement_age != null) {
    const ytr = p.profile.target_retirement_age - p.profile.current_age;
    if (ytr > 0 && ytr <= 10) {
      const critStart = cy + Math.max(0, ytr - 5);
      const critEnd = cy + ytr;
      const critEvs = futureEvs.filter((e) => e.year >= critStart && e.year <= critEnd && e.cost > 20000);
      if (critEvs.length > 0) {
        const totalCrit = critEvs.reduce((s, e) => s + e.cost, 0);
        alerts.push({
          severity: ytr <= 5 ? "critical" : "warning",
          title: `${critEvs.length} large expense${critEvs.length > 1 ? "s" : ""} within ${ytr <= 5 ? "5" : "10"} years of retirement`,
          description: `${fmt(Math.round(totalCrit))} in planned expenses land in the years leading up to your retirement target. Liquidating compounding assets at this stage has an outsized long-term cost.`,
          recommendation: "Pre-fund these expenses in a separate liquid account rather than liquidating investment assets. Adjust your forecast to see the impact.",
          tabKey: "forecast",
          years: critEvs.map((e) => e.year),
        });
      }
    }
  }

  // Detect: low emergency fund + upcoming major expenses
  const emergencyMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 99;
  const nearExpenses = futureEvs.filter((e) => e.year <= cy + 3 && e.cost > 5000);
  if (emergencyMonths < 3 && nearExpenses.length > 0) {
    alerts.push({
      severity: "critical",
      title: "Emergency reserves below 3 months with major expenses planned",
      description: `Liquid reserves cover ${emergencyMonths.toFixed(1)} months of expenses. With ${nearExpenses.length} planned expense event${nearExpenses.length > 1 ? "s" : ""} in the next 3 years, a single financial disruption could force selling investments at a loss.`,
      recommendation: "Prioritize building liquid reserves to at least 3 months before committing to large discretionary expenses.",
      tabKey: "balance",
      years: [],
    });
  }

  // Detect: education + career gap overlap
  for (const s of p.educationScenarios) {
    const collegeYear = cy + Math.max(0, 18 - s.child_current_age);
    for (const c of p.careerScenarios) {
      if (c.gap_months > 6 && Math.abs(collegeYear - cy - 1) <= 2) {
        alerts.push({
          severity: "info",
          title: "Career income gap near college start",
          description: `A career transition with a ${c.gap_months}-month income gap may coincide with college expenses. This combination reduces the savings available for both goals simultaneously.`,
          recommendation: "Ensure your 529 balance can cover the full college cost before the career transition begins.",
          tabKey: "events",
          years: [cy + 1, collegeYear],
        });
        break;
      }
    }
  }

  return alerts.slice(0, 5);
}

function computeFinnInsight(p: {
  savingsRate: number; monthlySavings: number;
  effectiveExpenses: number; liquidAssets: number;
  netWorth: number; totalLiabilities: number; totalAssets: number;
  retirementProb: number | null; projectedNWAtRetirement: number | null;
  yearsToRetire: number | null; profile: FinancialProfile | null;
  localReturn: number;
}): string {
  if (p.profile?.current_age == null) {
    return "Complete your profile to unlock personalized financial analysis and AI-driven priority recommendations.";
  }
  const emergencyMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 0;
  if (emergencyMonths < 1 && p.effectiveExpenses > 0) {
    return "Your emergency fund covers less than 1 month of expenses. A financial shock right now would likely force you to liquidate investments — this is the highest-priority gap to close.";
  }
  if (p.savingsRate >= 0 && p.savingsRate < 5) {
    return `At a ${p.savingsRate.toFixed(1)}% savings rate, compound growth is nearly flat. Reaching 20% would fundamentally change your retirement trajectory and unlock significant long-term wealth.`;
  }
  if (p.netWorth < 0) {
    return `Your liabilities exceed your assets by ${fmt(Math.abs(p.netWorth))}. Debt reduction is the single highest-leverage move — every dollar of principal eliminated compounds forward as investable capital.`;
  }
  if (p.retirementProb != null && p.retirementProb < 50) {
    const ytr = p.yearsToRetire;
    return `Your retirement probability is ${Math.round(p.retirementProb)}%.${ytr != null ? ` With ${ytr} years remaining, small changes now create disproportionately large outcomes.` : " Small changes now create disproportionately large outcomes."}`;
  }
  if (p.projectedNWAtRetirement != null && p.projectedNWAtRetirement > 0 && p.netWorth > 0) {
    const multiple = (p.projectedNWAtRetirement / p.netWorth).toFixed(1);
    return `You are on track to retire with approximately ${fmt(Math.round(p.projectedNWAtRetirement))} — ${multiple}× your current net worth. Maintaining your savings rate is the key variable.`;
  }
  const debtRatio = p.totalAssets > 0 ? (p.totalLiabilities / p.totalAssets) * 100 : 0;
  if (debtRatio > 40) {
    return `Liabilities represent ${debtRatio.toFixed(0)}% of your total assets. Reducing this below 20% would unlock a full 25-point boost to your Financial Health Score.`;
  }
  return "Your financial foundation is solid. The highest-leverage moves now are increasing your savings rate and modeling the major life decisions that will shape the next decade.";
}

// ── Balance Sheet helpers ─────────────────────────────────────────────────────

type AssetBucket = { label: string; value: number; color: string };

function computeAssetBuckets(assets: BalanceSheetItem[], portfolioValue: number): AssetBucket[] {
  const defs: { label: string; cats: string[]; color: string }[] = [
    { label: "Cash",        cats: ["cash"],                                                    color: "oklch(0.72 0.19 145)" },
    { label: "Portfolio",   cats: [],                                                          color: "oklch(0.65 0.18 260)" },
    { label: "Retirement",  cats: ["retirement"],                                              color: "oklch(0.72 0.16 220)" },
    { label: "Real Estate", cats: ["real_estate"],                                             color: "oklch(0.65 0.14 200)" },
    { label: "Other",       cats: ["vehicle", "personal_property", "business", "other_asset"], color: "oklch(0.58 0.06 260)" },
  ];
  return defs.flatMap((d) => {
    const v = d.label === "Portfolio"
      ? portfolioValue
      : assets.filter((a) => d.cats.includes(a.category)).reduce((s, a) => s + a.value, 0);
    return v > 0 ? [{ label: d.label, value: v, color: d.color }] : [];
  });
}

// Effective tax bucket for an asset — explicit tag wins, otherwise inferred from
// category so the breakdown is populated before users tag anything. Illiquid → null.
function effectiveTaxBucket(a: BalanceSheetItem): "taxable" | "tax_deferred" | "tax_free" | null {
  if (a.tax_treatment === "taxable" || a.tax_treatment === "tax_deferred" || a.tax_treatment === "tax_free") return a.tax_treatment;
  if (a.category === "cash" || a.category === "investment") return "taxable";
  if (a.category === "retirement") return "tax_deferred";
  return null;
}

const TAX_BUCKET_META: Record<"taxable" | "tax_deferred" | "tax_free", { label: string; color: string; note: string }> = {
  taxable:      { label: "Taxable",      color: "oklch(0.75 0.15 70)",  note: "Brokerage & savings. Gains taxed as you go; flexible, no withdrawal rules." },
  tax_deferred: { label: "Tax-deferred", color: "oklch(0.62 0.17 260)", note: "Traditional 401(k)/IRA. Withdrawals taxed as income; RMDs from age 73." },
  tax_free:     { label: "Tax-free",     color: "oklch(0.70 0.17 150)", note: "Roth & HSA. Qualified withdrawals tax-free; no RMDs on Roth IRA." },
};

// A linked BuyTune portfolio, classified by its account type.
type PortfolioAccount = { id: string; name: string; account_type: string | null; value: number };

// Map a portfolio's account type to a tax bucket. Roth/HSA → tax-free; 401k/IRA/pension →
// tax-deferred; brokerage/cash/everything else → taxable. (Roth checked first so "Roth IRA"
// doesn't fall through to the generic "ira" → deferred branch.)
function accountTypeTaxBucket(t: string | null): "taxable" | "tax_deferred" | "tax_free" {
  const s = (t ?? "").toLowerCase();
  if (s.includes("roth") || s.includes("hsa")) return "tax_free";
  if (s.includes("401") || s.includes("403") || s.includes("ira") || s.includes("pension") || s.includes("sep") || s.includes("simple") || s.includes("traditional") || s.includes("retire")) return "tax_deferred";
  return "taxable";
}
function isRetirementAccountType(t: string | null): boolean {
  const s = (t ?? "").toLowerCase();
  return s.includes("401") || s.includes("403") || s.includes("ira") || s.includes("roth") || s.includes("pension") || s.includes("sep") || s.includes("retire");
}

// Compute the three tax buckets from balance-sheet items + linked portfolios (each
// portfolio bucketed by its own account type, e.g. a Roth IRA portfolio is tax-free).
function computeTaxBuckets(assets: BalanceSheetItem[], portfolioAccounts: PortfolioAccount[]): { taxable: number; tax_deferred: number; tax_free: number; total: number } {
  let taxable = 0, tax_deferred = 0, tax_free = 0;
  for (const p of portfolioAccounts) {
    if (!(p.value > 0)) continue;
    const b = accountTypeTaxBucket(p.account_type);
    if (b === "tax_free") tax_free += p.value;
    else if (b === "tax_deferred") tax_deferred += p.value;
    else taxable += p.value;
  }
  for (const a of assets) {
    const b = effectiveTaxBucket(a);
    if (b === "taxable") taxable += a.value;
    else if (b === "tax_deferred") tax_deferred += a.value;
    else if (b === "tax_free") tax_free += a.value;
  }
  return { taxable, tax_deferred, tax_free, total: taxable + tax_deferred + tax_free };
}

// One-line read on tax diversification — the planning concept that having money across
// all three buckets gives you levers to control taxable income in retirement.
function taxDiversificationInsight(b: { taxable: number; tax_deferred: number; tax_free: number; total: number }): string {
  if (b.total <= 0) return "Tag your accounts as taxable, tax-deferred, or tax-free to see your tax diversification.";
  const pct = (v: number) => (v / b.total) * 100;
  const dpct = pct(b.tax_deferred), fpct = pct(b.tax_free), tpct = pct(b.taxable);
  if (fpct < 5 && b.total > 25000) return "Almost no tax-free (Roth) money. Every retirement dollar will be taxed as income or capital gains — Roth space adds flexibility to control your tax bracket later.";
  if (dpct > 80) return "Heavily concentrated in tax-deferred accounts. Withdrawals are taxed as ordinary income and forced by RMDs at 73 — consider building taxable or Roth balances for flexibility.";
  if (tpct > 85 && b.total > 25000) return "Nearly everything is in taxable accounts. Tax-advantaged space (401k, IRA, Roth) could shelter more of your growth from taxes.";
  if (fpct >= 20 && dpct >= 20 && tpct >= 15) return "Well diversified across tax buckets — you'll have levers to manage taxable income in retirement.";
  return "A mix across taxable, tax-deferred, and tax-free accounts gives you the most control over taxes in retirement.";
}

function computeBalanceFinnInsight(p: {
  liquidAssets: number; totalAssets: number; totalLiabilities: number;
  netWorth: number; portfolioTotalValue: number;
  effectiveExpenses: number; assets: BalanceSheetItem[];
  portfolioAccounts?: PortfolioAccount[];
}): string {
  if (p.totalAssets === 0) return "Add assets and liabilities below to unlock balance sheet intelligence.";
  const debtRatio = p.totalAssets > 0 ? (p.totalLiabilities / p.totalAssets) * 100 : 0;
  const emergencyMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 0;
  const cashPct = p.totalAssets > 0 ? (p.liquidAssets / p.totalAssets) * 100 : 0;
  const portfolioPct = p.netWorth > 0 ? (p.portfolioTotalValue / p.netWorth) * 100 : 0;
  // A linked retirement portfolio (Roth/401k/IRA) counts too — not just manual line items.
  const hasRetirement = p.assets.some((a) => a.category === "retirement")
    || (p.portfolioAccounts ?? []).some((pa) => pa.value > 0 && isRetirementAccountType(pa.account_type));
  if (debtRatio > 50) return `Liabilities represent ${debtRatio.toFixed(0)}% of total assets. Debt reduction is the highest-leverage balance sheet move — every dollar eliminated compounds forward as investable capital.`;
  if (p.effectiveExpenses > 0 && emergencyMonths < 1) return "Liquid cash covers less than 1 month of expenses. A single financial shock would force selling investments at a bad time. Building to 3 months is the top balance sheet priority.";
  if (!hasRetirement && p.totalAssets > 10000) return "No retirement account on your balance sheet. Add any 401k, IRA, or Roth IRA balances — Atlas needs these for an accurate long-term picture.";
  if (p.totalAssets > 50000 && cashPct > 30) return `Cash is ${cashPct.toFixed(0)}% of your assets. Moving excess above 6 months of expenses into investments would compound more effectively over time.`;
  if (p.netWorth > 30000 && portfolioPct < 15) return `Investment portfolio represents ${portfolioPct.toFixed(0)}% of net worth. Gradually increasing this allocation is one of the highest-leverage moves for long-term wealth.`;
  if (emergencyMonths >= 3 && debtRatio < 20 && p.netWorth > 0) return "Strong balance sheet — adequate reserves and low debt. Primary focus now is growing investment and retirement assets.";
  return "Build out your balance sheet with all assets and liabilities for the most complete picture.";
}

// ── Cash Flow helpers ─────────────────────────────────────────────────────────

function computeCashFlowHealth(p: {
  savingsRate: number; monthlyExpenses: number;
  effectiveIncome: number; cashFlowItems: CashFlowItem[];
}): { total: number; factors: { name: string; score: number; max: number; direction: "strength" | "neutral" | "weakness" }[] } {
  const dir = (s: number, hi: number): "strength" | "neutral" | "weakness" =>
    s >= hi * 0.75 ? "strength" : s >= hi * 0.4 ? "neutral" : "weakness";
  const srScore = Math.min(30, (Math.max(0, p.savingsRate) / 20) * 30);
  const housing = p.cashFlowItems.filter((i) => i.type === "expense" && categoryOf(i) === "Housing").reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const hPct = p.monthlyExpenses > 0 ? housing / p.monthlyExpenses : 0;
  const housingScore = hPct <= 0 ? 12 : Math.min(25, Math.max(0, (0.5 - hPct) / 0.5 * 25 + 12));
  const catMax = p.monthlyExpenses > 0
    ? Math.max(0, ...EXPENSE_CATEGORIES.map((c) =>
        p.cashFlowItems.filter((i) => i.type === "expense" && categoryOf(i) === c.label)
          .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0) / p.monthlyExpenses))
    : 0;
  const concScore = Math.min(25, Math.max(0, (1 - catMax) * 25));
  const incomeCount = p.cashFlowItems.filter((i) => i.type === "income").length;
  const divScore = incomeCount >= 3 ? 20 : incomeCount === 2 ? 16 : incomeCount === 1 ? 10 : p.effectiveIncome > 0 ? 5 : 0;
  return {
    total: Math.round(srScore + housingScore + concScore + divScore),
    factors: [
      { name: "Savings Rate",   score: Math.round(srScore),      max: 30, direction: dir(srScore, 30)      },
      { name: "Housing Burden", score: Math.round(housingScore), max: 25, direction: dir(housingScore, 25) },
      { name: "Expense Mix",    score: Math.round(concScore),    max: 25, direction: dir(concScore, 25)    },
      { name: "Income Streams", score: Math.round(divScore),     max: 20, direction: dir(divScore, 20)     },
    ],
  };
}

function computeCashFlowFinnInsight(p: {
  savingsRate: number; monthlySavings: number; monthlyExpenses: number;
  effectiveIncome: number; cashFlowItems: CashFlowItem[]; localReturn: number;
}): string {
  if (p.effectiveIncome === 0) return "Add income and expense items to unlock cash flow analysis and personalized insights.";
  const housing = p.cashFlowItems.filter((i) => i.type === "expense" && categoryOf(i) === "Housing").reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const hPct = p.monthlyExpenses > 0 ? (housing / p.monthlyExpenses) * 100 : 0;
  if (p.savingsRate < 0) return `Expenses exceed income by ${fmt(Math.abs(p.monthlySavings))}/month. This deficit is compounding in reverse — closing it is the most urgent financial action.`;
  if (hPct > 40) return `Housing consumes ${hPct.toFixed(0)}% of monthly expenses — above the 30% guideline. This single category is likely the primary constraint on your savings rate.`;
  if (p.savingsRate < 10) {
    const gap = Math.round(p.effectiveIncome * 0.10 - p.monthlySavings);
    return `Savings rate is ${p.savingsRate.toFixed(1)}%. Redirecting ${fmt(gap)}/month more reaches the 10% threshold — a meaningful inflection point for long-term wealth.`;
  }
  const r = p.localReturn;
  const fv = r > 0
    ? Math.round(p.monthlySavings * 12 * (Math.pow(1 + r, 10) - 1) / r)
    : Math.round(p.monthlySavings * 120);
  return `Saving ${fmt(p.monthlySavings)}/month at a ${p.savingsRate.toFixed(1)}% rate — that compounds to approximately ${fmt(fv)} over 10 years at your current return assumption.`;
}

// ── Forecast drivers ──────────────────────────────────────────────────────────

type ForecastDriver = { label: string; impact: number | null; type: "modeled" | "unmodeled" };

function computeForecastDrivers(p: {
  netWorth: number; effectiveIncome: number; effectiveExpenses: number;
  forecastYears: number; localReturn: number; localInflation: number; localSalaryGrowth: number;
  futureEvents: FutureEvent[]; currentYear: number;
  baselineAtRetirement: number | null;
  hasHomeScenario: boolean; hasCareerScenario: boolean;
}): ForecastDriver[] {
  if (p.baselineAtRetirement == null || p.forecastYears <= 0 || p.effectiveIncome === 0) return [];
  const base = p.baselineAtRetirement;
  const last = (bands: ForecastPoint[]) => bands.length > 0 ? bands[bands.length - 1].baseline : 0;

  const laterBands = buildForecastBands(p.netWorth, p.effectiveIncome, p.effectiveExpenses,
    p.forecastYears + 3, p.localReturn, p.localInflation, p.localSalaryGrowth, p.futureEvents, p.currentYear);
  const returnBands = buildForecastBands(p.netWorth, p.effectiveIncome, p.effectiveExpenses,
    p.forecastYears, p.localReturn + 0.01, p.localInflation, p.localSalaryGrowth, p.futureEvents, p.currentYear);
  const savingsBands = buildForecastBands(p.netWorth, p.effectiveIncome + 500, p.effectiveExpenses,
    p.forecastYears, p.localReturn, p.localInflation, p.localSalaryGrowth, p.futureEvents, p.currentYear);

  const drivers: ForecastDriver[] = [
    { label: "Retire 3 years later", impact: last(laterBands) - base, type: "modeled" },
    { label: "+1% investment return", impact: last(returnBands) - base, type: "modeled" },
    { label: "+$500/month savings", impact: last(savingsBands) - base, type: "modeled" },
    { label: "Home purchase", impact: null, type: p.hasHomeScenario ? "modeled" : "unmodeled" },
    { label: "Career change", impact: null, type: p.hasCareerScenario ? "modeled" : "unmodeled" },
  ];
  return drivers.sort((a, b) => {
    if (a.impact !== null && b.impact !== null) return Math.abs(b.impact) - Math.abs(a.impact);
    if (a.impact !== null) return -1;
    if (b.impact !== null) return 1;
    return 0;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CountUp({
  to, prefix = "", suffix = "", decimals = 0, duration = 1000, isPrivate = false,
}: { to: number; prefix?: string; suffix?: string; decimals?: number; duration?: number; isPrivate?: boolean }) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    startRef.current = null;
    setVal(0);
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setVal(to * ease);
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else setVal(to);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);
  if (isPrivate) return <>{"••••••"}</>;
  const n = Number(val.toFixed(decimals));
  const formatted = decimals > 0
    ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(val).toLocaleString("en-US");
  return <>{prefix}{formatted}{suffix}</>;
}

function InfoTooltip({ text, align = "center" }: { text: string; align?: "center" | "start" | "end" }) {
  const [visible, setVisible] = useState(false);
  const boxPos =
    align === "start" ? { left: 0, transform: "none" as const }
    : align === "end" ? { right: 0, transform: "none" as const }
    : { left: "50%", transform: "translateX(-50%)" };
  const arrowPos =
    align === "start" ? { left: "14px", transform: "none" as const }
    : align === "end" ? { right: "14px", transform: "none" as const }
    : { left: "50%", transform: "translateX(-50%)" };
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
          position: "absolute", bottom: "calc(100% + 8px)",
          background: "var(--bg-overlay, #0d1829)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: "10px 13px",
          fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)",
          lineHeight: 1.55, width: "230px", maxWidth: "70vw", zIndex: 100,
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)", pointerEvents: "none",
          textTransform: "none", letterSpacing: "normal", fontWeight: 400,
          ...boxPos,
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid var(--border)",
            ...arrowPos,
          }} />
        </div>
      )}
    </span>
  );
}

function NetWorthHistoryCard({
  history, currentNW, currentAssets, currentLiabilities, isPrivate,
}: {
  history: NetWorthSnapshot[];
  currentNW: number;
  currentAssets: number;
  currentLiabilities: number;
  isPrivate?: boolean;
}) {
  const hide = isPrivate ? "••••••" : null;
  const [showTrim, setShowTrim] = useState(false);
  const [trimDate, setTrimDate] = useState("");
  const [trimStatus, setTrimStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const chartData = allPoints.map((p) => ({ date: p.date.slice(0, 10), value: p.net_worth }));

  const n = chartData.length;
  const spanDays = n >= 2
    ? (new Date(chartData[n - 1].date + "T12:00:00").getTime() - new Date(chartData[0].date + "T12:00:00").getTime()) / 86400000
    : 0;
  const tickInterval = n <= 5 ? 0 : Math.max(1, Math.floor((n - 1) / 4));
  function nwTickFmt(dateStr: string) {
    const d = new Date(dateStr.slice(0, 10) + "T12:00:00");
    if (spanDays > 300) return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    if (spanDays > 60) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function handleTrim() {
    if (!trimDate) return;
    startTransition(async () => {
      const result = await trimNetWorthHistoryBefore(trimDate);
      if (result.error) {
        setTrimStatus(`Error: ${result.error}`);
      } else {
        setTrimStatus(`Removed ${result.deleted} snapshot${result.deleted !== 1 ? "s" : ""} before ${new Date(trimDate + "T12:00:00").toLocaleDateString()}. Refresh to update the chart.`);
        setShowTrim(false);
      }
    });
  }

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: allPoints.length >= 2 ? "16px" : "8px" }}>
        <div>
          <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Net Worth</div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "30px", color: currentNW >= 0 ? "var(--text-primary)" : "var(--red)", lineHeight: 1.1 }}>
            {hide ?? fmt(currentNW)}
          </div>
          {change != null && (
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: isUp ? "var(--green)" : "var(--red)", marginTop: "4px" }}>
              {isUp ? "▲" : "▼"} {hide ?? (isUp ? "+" : "") + fmt(change)} {hide ? "" : `since ${fmtDate(first.date)}`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}>
          {[
            { label: "Total Assets",      value: hide ?? fmt(currentAssets),      color: "var(--green)" },
            { label: "Total Liabilities", value: hide ?? fmt(currentLiabilities), color: currentLiabilities > 0 ? "var(--red)" : "var(--text-secondary)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "16px", color }}>{value}</div>
            </div>
          ))}
          {allPoints.length >= 2 && (
            <button
              onClick={() => { setShowTrim(t => !t); setTrimStatus(null); }}
              style={{ fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px", padding: "0", marginTop: "18px" }}
            >
              Fix chart
            </button>
          )}
        </div>
      </div>

      {trimStatus && (
        <div style={{ fontSize: "11px", color: trimStatus.startsWith("Error") ? "var(--red)" : "var(--green)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>{trimStatus}</span>
          {!trimStatus.startsWith("Error") && (
            <button onClick={() => { setTrimStatus(null); window.location.reload(); }} style={{ color: "var(--text-muted)", fontSize: "10px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Refresh now</button>
          )}
        </div>
      )}

      {showTrim && (
        <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "var(--surface-004)", border: "1px solid var(--line-008)", fontSize: "11px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "6px" }}>
            Remove all net worth history before this date.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={trimDate}
              onChange={(e) => setTrimDate(e.target.value)}
              style={{ background: "var(--surface-008)", border: "1px solid var(--line-015)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleTrim}
              disabled={isPending || !trimDate}
              style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", opacity: isPending || !trimDate ? 0.4 : 1 }}
            >
              {isPending ? "Removing…" : "Remove those snapshots"}
            </button>
            <button onClick={() => setShowTrim(false)} style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
            <XAxis dataKey="date" tickFormatter={nwTickFmt} interval={tickInterval} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => isPrivate ? "•••" : "$" + (Math.abs(v) >= 1000000 ? (v / 1000000).toFixed(1) + "M" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-tertiary)" }}
              axisLine={false} tickLine={false} width={isPrivate ? 28 : 52}
            />
            <Tooltip
              contentStyle={{ background: "var(--bg-overlay, #0d1829)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}
              labelStyle={{ color: "var(--text-secondary)" }}
              labelFormatter={(label) => nwTickFmt(String(label))}
              formatter={(value) => [isPrivate ? "••••••" : fmt(typeof value === "number" ? value : 0), "Net Worth"]}
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

const ASSET_CATEGORIES: [string, string][] = [
  ["cash",              "Cash & Bank Accounts"],
  ["investment",        "Investment / Brokerage"],
  ["retirement",        "Retirement Account (401k / IRA / Roth)"],
  ["real_estate",       "Real Estate"],
  ["vehicle",           "Vehicle"],
  ["personal_property", "Personal Property (jewelry, watches, art)"],
  ["business",          "Business Interest"],
  ["other_asset",       "Other Asset"],
];

const LIABILITY_CATEGORIES: [string, string][] = [
  ["mortgage",      "Mortgage"],
  ["auto_loan",     "Auto Loan"],
  ["student_loan",  "Student Loan"],
  ["credit_card",   "Credit Card Debt"],
  ["personal_loan", "Personal Loan"],
  ["other_liability","Other Debt"],
];

// Tax buckets — shown only for liquid/investable assets, the foundation for
// tax-aware withdrawal modeling (taxable vs Traditional vs Roth).
const TAX_TREATMENT_OPTIONS: [string, string][] = [
  ["taxable",      "Taxable (brokerage, savings)"],
  ["tax_deferred", "Tax-deferred (Traditional)"],
  ["tax_free",     "Tax-free (Roth / HSA)"],
];
const LIQUID_ASSET_CATS = new Set(["cash", "investment", "retirement"]);
function defaultTaxTreatment(cat: string): string {
  if (cat === "retirement") return "tax_deferred";
  return "taxable";
}
const TAX_TREATMENT_LABEL: Record<string, string> = {
  taxable: "Taxable", tax_deferred: "Tax-deferred", tax_free: "Tax-free",
};

function AddItemRow({
  type, onAdd, placeholder, sectionType = "asset",
}: {
  type: "balance" | "cashflow";
  onAdd: (fd: FormData) => void;
  placeholder?: string;
  sectionType?: "asset" | "liability";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cat, setCat] = useState(sectionType === "liability" ? "mortgage" : "cash");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await onAdd(fd);
      formRef.current?.reset();
      setCat(sectionType === "liability" ? "mortgage" : "cash");
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
          <select name="category" style={selectStyle} value={cat} onChange={(e) => setCat(e.target.value)}>
            {(sectionType === "liability" ? LIABILITY_CATEGORIES : ASSET_CATEGORIES).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
          <input name="value" type="number" min="0" step="0.01" placeholder="Value ($)" required style={{ ...inputStyle, width: "120px" }} />
          {sectionType !== "liability" && LIQUID_ASSET_CATS.has(cat) && (
            <select key={cat} name="tax_treatment" style={selectStyle} defaultValue={defaultTaxTreatment(cat)} title="How this account is taxed — used for tax-aware retirement modeling">
              {TAX_TREATMENT_OPTIONS.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          )}
        </>
      ) : (
        <>
          <select name="type" style={selectStyle} defaultValue="income">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select name="frequency" style={selectStyle} defaultValue="monthly">
            {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
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
  item, type, onDelete, isPrivate = false, editTitle,
}: {
  item: BalanceSheetItem | CashFlowItem;
  type: "balance" | "cashflow";
  onDelete: (id: string) => void;
  isPrivate?: boolean;
  editTitle?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const isBalance = type === "balance";
  const bal = item as BalanceSheetItem;
  const cf = item as CashFlowItem;
  const [isVar, setIsVar] = useState(!!(cf as CashFlowItem).is_variable);
  const [editCat, setEditCat] = useState(isBalance ? bal.category : "");

  const displayValue = isPrivate
    ? "••••••"
    : isBalance
      ? fmtFull(bal.value)
      : fmtFull(cf.amount) + " / " + (freqSuffix(cf.frequency));

  const accentColor = isBalance
    ? (bal.is_liability ? "var(--red)" : "var(--green)")
    : (cf.type === "income" ? "var(--green)" : "var(--red)");

  function handleDelete() {
    if (!confirm(`Remove "${item.label}"?`)) return;
    startTransition(async () => { await onDelete(item.id); router.refresh(); });
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
            <select name="category" value={editCat} onChange={(e) => setEditCat(e.target.value)} style={selectStyle}>
              {(bal.is_liability ? LIABILITY_CATEGORIES : ASSET_CATEGORIES).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
            <input name="value" type="number" min="0" step="0.01" defaultValue={bal.value} style={{ ...inputStyle, width: "120px" }} />
            {!bal.is_liability && LIQUID_ASSET_CATS.has(editCat) && (
              <select key={editCat} name="tax_treatment" style={selectStyle}
                defaultValue={bal.tax_treatment ?? defaultTaxTreatment(editCat)}
                title="How this account is taxed — used for tax-aware retirement modeling">
                {TAX_TREATMENT_OPTIONS.map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            )}
          </>
        ) : (
          <>
            <select name="type" defaultValue={cf.type} style={selectStyle}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select name="frequency" defaultValue={cf.frequency} style={selectStyle}>
              {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
            <input name="amount" type="number" min="0" step="0.01" defaultValue={cf.amount} style={{ ...inputStyle, width: "120px" }} />
            <input name="due_day" type="number" min="1" max="31" defaultValue={cf.due_day ?? ""} placeholder="Due day (1–31)" style={{ ...inputStyle, width: "140px" }} />
            {cf.type === "income" && (
              <>
                <input type="hidden" name="is_variable" value={isVar ? "1" : "0"} />
                <button type="button" onClick={() => setIsVar((v) => !v)} title="Income that fluctuates month to month"
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", height: "34px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)", border: `1px solid ${isVar ? "var(--brand-blue)" : "var(--border-subtle)"}`, background: isVar ? "rgba(37,99,235,0.1)" : "var(--bg-base)", color: isVar ? "var(--brand-blue)" : "var(--text-secondary)" }}>
                  <span style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${isVar ? "var(--brand-blue)" : "var(--border-default)"}`, background: isVar ? "var(--brand-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isVar && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  Variable
                </button>
              </>
            )}
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
      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
        {!isBalance && (cf as CashFlowItem).is_variable && (
          <span style={{ fontSize: "9px", fontWeight: 600, color: "rgba(96,165,250,0.9)", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(96,165,250,0.25)", padding: "1px 6px", borderRadius: "var(--radius-full, 999px)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>~ Variable</span>
        )}
        {isBalance && !bal.is_liability && (() => {
          const b = effectiveTaxBucket(bal);
          if (!b) return null;
          const meta = TAX_BUCKET_META[b];
          return (
            <span title={meta.note} style={{ fontSize: "9px", fontWeight: 600, color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 35%, transparent)`, padding: "1px 6px", borderRadius: "var(--radius-full, 999px)", flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>
          );
        })()}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: accentColor, fontWeight: 500 }}>{displayValue}</span>
      <button type="button" onClick={() => setEditing(true)} style={iconBtnStyle} title={editTitle ?? "Edit"}>
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
  background: "var(--brand-gradient)", color: "#fff",
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
  { label: "Housing",        keywords: ["rent", "mortgage", "hoa", "property tax", "home insurance", "maintenance", "repair", "condo", "lease", "landlord", "apartment", "storage"],              emoji: "🏠" },
  { label: "Transportation", keywords: ["car", "gas", "fuel", "auto insurance", "parking", "uber", "lyft", "transit", "bus", "subway", "toll", "vehicle", "train", "metro", "tesla", "zipcar", "enterprise", "hertz", "avis", "getaround"],                                                                   emoji: "🚗" },
  { label: "Food & Dining",  keywords: ["grocery", "groceries", "food", "restaurant", "dining", "coffee", "lunch", "dinner", "breakfast", "meal", "delivery", "doordash", "instacart", "takeout", "waffle", "donut", "taco", "burger", "pizza", "sushi", "steak", "grill", "grille", "tavern", "kitchen", "diner", "bistro", "cafe", "bakery", "bbq", "barbecue", "seafood", "noodle", "ramen", "poke", "chipotle", "mcdonald", "wendy", "chick-fil-a", "chick fil", "subway", "panera", "starbucks", "dunkin", "popeyes", "domino", "papa john", "five guys", "shake shack", "in-n-out", "whataburger", "dairy queen", "sonic drive", "jack in the box", "cook out", "cookout", "silver skillet", "spaghetti", "western", "waffle house", "heb", "curbside", "whole foods", "trader joe", "aldi", "kroger", "publix", "safeway", "wegmans", "target grocery", "walmart grocery", "leaf", "grain", "bean", "bottle", "dark horse", "queen donut", "total wine", "specs", "wine", "spirits", "lunchdrop", "grubhub", "uber eats", "postmates", "seamless", "gopuff"], emoji: "🍽️" },
  { label: "Healthcare",     keywords: ["health", "medical", "doctor", "dental", "vision", "pharmacy", "prescription", "therapy", "counseling", "cvs", "walgreen", "rite aid", "urgent care", "hospital", "clinic", "lab", "quest diagnostics"],                                                               emoji: "🏥" },
  { label: "Fitness",        keywords: ["gym", "fitness", "yoga", "workout", "pilates", "peloton", "crossfit", "exercise", "planet fitness", "anytime fitness", "la fitness", "24 hour fitness", "orange theory", "equinox", "barry's", "soul cycle", "classpass"],                                             emoji: "💪" },
  { label: "Insurance",      keywords: ["life insurance", "disability", "renters insurance", "term life", "umbrella policy", "insurance premium", "geico", "state farm", "allstate", "progressive", "lemonade"],                                                                                                 emoji: "🛡️" },
  { label: "Utilities",      keywords: ["electric", "electricity", "gas bill", "water", "internet", "phone", "cell", "utility", "heating", "cooling", "cable", "sewage", "at&t", "verizon", "t-mobile", "comcast", "xfinity", "spectrum", "cox", "clean sky", "reliant", "txu", "pge", "con ed", "duke energy"], emoji: "⚡" },
  { label: "Entertainment",  keywords: ["streaming", "spotify", "netflix", "hulu", "disney", "games", "gaming", "movies", "books", "hobby", "concert", "theater", "apple tv", "hbo", "paramount", "peacock", "crunchyroll", "twitch", "youtube premium", "xbox", "playstation", "steam", "ticketmaster", "stubhub", "amc", "regal", "cinemark"],                                                                   emoji: "🎬" },
  { label: "Travel",         keywords: ["travel", "vacation", "hotel", "flight", "airbnb", "trip", "cruise", "delta", "united", "southwest", "american airlines", "marriott", "hilton", "hyatt", "expedia", "booking", "vrbo", "kayak", "priceline"],                                                          emoji: "✈️" },
  { label: "Subscriptions",  keywords: ["subscription", "membership", "amazon prime", "premium", "software", "saas", "monthly service", "claude", "chatgpt", "openai", "anthropic", "google one", "icloud", "microsoft 365", "adobe", "notion", "figma", "dropbox", "lastpass", "1password", "nordvpn", "expressvpn"],                                                                                           emoji: "📱" },
  { label: "Childcare",      keywords: ["childcare", "daycare", "school", "tuition", "babysitter", "nanny", "kids", "children", "after school", "preschool", "montessori"],                       emoji: "👶" },
  { label: "Other",          keywords: [],                                                                                                                                                         emoji: "📦" },
];

function getCategoryForExpense(label: string): string {
  const lower = label.toLowerCase();
  // Exact category label match first — handles category-level budget items ("Food & Dining", etc.)
  const exact = EXPENSE_CATEGORIES.find((c) => c.label.toLowerCase() === lower);
  if (exact) return exact.label;
  // Keyword scan
  for (const cat of EXPENSE_CATEGORIES.slice(0, -1)) {
    if (cat.keywords.some((k) => lower.includes(k))) return cat.label;
  }
  return "Other";
}

// Resolve an item's category: user-assigned wins, else infer from the label.
function categoryOf(item: { label: string; category?: string | null }): string {
  return item.category ?? getCategoryForExpense(item.label);
}

// ── 50/30/20 framework ──────────────────────────────────────────────────────
// Maps each expense category into Needs vs Wants. Savings is the residual
// (income − needs − wants). Heuristic by design — Food & Dining leans grocery
// (a need); "Other" is treated as discretionary.
type SpendBucket = "needs" | "wants";
const CATEGORY_BUCKET: Record<string, SpendBucket> = {
  Housing: "needs",
  Transportation: "needs",
  "Food & Dining": "needs",
  Healthcare: "needs",
  Insurance: "needs",
  Utilities: "needs",
  Childcare: "needs",
  Entertainment: "wants",
  Travel: "wants",
  Fitness: "wants",
  Subscriptions: "wants",
  Other: "wants",
};
function bucketForCategory(category: string): SpendBucket {
  return CATEGORY_BUCKET[category] ?? "wants";
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

function OnboardingWizard({ onClose, profile }: { onClose: () => void; profile?: FinancialProfile | null }) {
  const STEPS = ["Profile", "Income", "Expenses", "Assets & Debts", "Ready"];
  const [step, setStep] = useState(0);
  const [profPending, startProfTransition] = useTransition();
  const [itemPending, startItemTransition] = useTransition();

  const [wizardIncome, setWizardIncome] = useState<{ label: string; amount: number; frequency: string }[]>([]);
  const [wizardExpenses, setWizardExpenses] = useState<{ label: string; amount: number; frequency: string }[]>([]);
  const [wizardAssets, setWizardAssets] = useState<{ label: string; value: number; kind: "asset" | "debt" }[]>([]);
  // Essentials captured at step 0 — powers the "here's where you stand" reveal without a refresh.
  // Prefilled from an existing profile so replaying the setup lands on a real number instantly.
  const [wizProfile, setWizProfile] = useState<{ age: number | null; retireAt: number | null; grossMonthly: number; monthlyExpenses: number }>({
    age: profile?.current_age ?? null,
    retireAt: profile?.target_retirement_age ?? null,
    grossMonthly: profile?.gross_monthly_income ?? 0,
    monthlyExpenses: profile?.monthly_expenses ?? 0,
  });
  const [animProb, setAnimProb] = useState(0); // count-up + ring-draw animation for the reveal

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
    const dob = String(fd.get("date_of_birth") || "");
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    setWizProfile({
      age,
      retireAt: Number(fd.get("target_retirement_age")) || null,
      grossMonthly: Number(fd.get("gross_monthly_income")) || 0,
      monthlyExpenses: Number(fd.get("monthly_expenses")) || 0,
    });
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

  // "Here's where you stand" — compute a quick readiness read from what was entered.
  // Uses the same 25× logic as the hub; a deliberately simple preview, not the full engine.
  const reveal = useMemo(() => {
    const freqM = (amt: number, f: string) =>
      f === "weekly" ? amt * 52 / 12 : f === "biweekly" ? amt * 26 / 12 : f === "semimonthly" ? amt * 2
      : f === "quarterly" ? amt / 3 : f === "annual" ? amt / 12 : amt;
    const incomeM = wizardIncome.length ? wizardIncome.reduce((s, i) => s + freqM(i.amount, i.frequency), 0) : wizProfile.grossMonthly * 0.75;
    const expM = wizardExpenses.length ? wizardExpenses.reduce((s, i) => s + freqM(i.amount, i.frequency), 0) : wizProfile.monthlyExpenses;
    const assetsTotal = wizardAssets.filter((a) => a.kind === "asset").reduce((s, a) => s + a.value, 0);
    const debtsTotal = wizardAssets.filter((a) => a.kind === "debt").reduce((s, a) => s + a.value, 0);
    const netWorth = assetsTotal - debtsTotal;
    const monthlySavings = incomeM - expM;
    const yearsToRet = (wizProfile.age != null && wizProfile.retireAt != null) ? Math.max(0, wizProfile.retireAt - wizProfile.age) : null;
    const annualExpenses = expM * 12;
    if (yearsToRet == null || annualExpenses <= 0) return null;
    const r = 0.07, annualSavings = monthlySavings * 12;
    const series: number[] = [Math.max(0, netWorth)];
    let nw = Math.max(0, netWorth);
    for (let y = 0; y < yearsToRet; y++) { nw = nw * (1 + r) + annualSavings; series.push(Math.max(0, nw)); }
    const projected = Math.max(0, nw);
    const inflatedExpenses = annualExpenses * Math.pow(1.03, yearsToRet);
    const prob = calcRetirementProbability(projected, inflatedExpenses);
    return { netWorth, monthlySavings, projected, prob, yearsToRet, series, retireAt: wizProfile.retireAt };
  }, [wizardIncome, wizardExpenses, wizardAssets, wizProfile]);

  // Animate the readiness ring + number up from 0 when the reveal appears.
  useEffect(() => {
    if (step !== 4 || !reveal || reveal.prob == null) { setAnimProb(0); return; }
    const target = reveal.prob, start = performance.now(), dur = 950;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setAnimProb(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out-cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, reveal]);

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
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Let{"'"}s see where you stand</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 22px", lineHeight: 1.6 }}>
              Four basics and we{"'"}ll show your retirement readiness in under a minute. You can refine everything later.
            </p>
            <form onSubmit={handleProfileSave}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Date of Birth</label>
                    <input name="date_of_birth" type="date" required max={new Date().toISOString().split("T")[0]} defaultValue={profile?.date_of_birth ?? ""} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Retire At</label>
                    <input name="target_retirement_age" type="number" min="40" max="85" defaultValue={profile?.target_retirement_age ?? 65} placeholder="65" style={fieldStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Gross Monthly Income</label>
                    <input name="gross_monthly_income" type="number" min="0" step="100" placeholder="e.g. 8500" defaultValue={profile?.gross_monthly_income ?? ""} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Monthly Expenses</label>
                    <input name="monthly_expenses" type="number" min="0" step="100" placeholder="e.g. 3500" defaultValue={profile?.monthly_expenses ?? ""} style={fieldStyle} />
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--green)" }}>+{fmt(item.amount)} / {freqSuffix(item.frequency)}</span>
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
                  {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
                <button type="submit" disabled={itemPending} style={{ ...btnPrimaryStyle, whiteSpace: "nowrap" }}>Add</button>
              </div>
            </form>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setStep(0)} style={{ ...btnSecondaryStyle, padding: "11px 14px" }}>← Back</button>
              <button type="button" onClick={() => setStep(2)} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>Continue →</button>
            </div>
            <button type="button" onClick={() => setStep(4)} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer", textDecoration: "underline" }}>Skip ahead — see my number now →</button>
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--red)" }}>{fmt(item.amount)} / {freqSuffix(item.frequency)}</span>
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
                  {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
                <button type="submit" disabled={itemPending} style={{ ...btnPrimaryStyle, whiteSpace: "nowrap" }}>Add</button>
              </div>
            </form>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setStep(1)} style={{ ...btnSecondaryStyle, padding: "11px 14px" }}>← Back</button>
              <button type="button" onClick={() => setStep(3)} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>Continue →</button>
            </div>
            <button type="button" onClick={() => setStep(4)} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer", textDecoration: "underline" }}>Skip ahead — see my number now →</button>
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

        {/* Step 4: Here's where you stand — the payoff reveal */}
        {step === 4 && (() => {
          // Fallback when we don't have enough to compute (no age / retirement age / expenses)
          if (!reveal || reveal.prob == null) {
            return (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>You{"'"}re set up</h2>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 22px", lineHeight: 1.7 }}>
                  Add your age, retirement age, and monthly expenses to see your readiness, then explore your full plan.
                </p>
                <button type="button" onClick={dismiss} style={{ ...btnPrimaryStyle, padding: "12px 36px", fontSize: "13px", fontWeight: 700 }}>See my plan</button>
              </div>
            );
          }
          const prob = reveal.prob;
          const color = prob >= 75 ? "var(--green)" : prob >= 50 ? "var(--amber)" : "var(--red)";
          const verdict = prob >= 80 ? "You're on track. A strong position for your timeline."
            : prob >= 60 ? "You're close. A few moves put retirement well within reach."
            : prob >= 35 ? "A real start. There's a gap to close, and the time to close it."
            : "Early days, and that's fine. Your plan shows exactly which levers move this most.";
          const R = 52, C = 2 * Math.PI * R, off = C * (1 - animProb / 100);
          // Trajectory sparkline
          const max = Math.max(...reveal.series, 1);
          const pts = reveal.series.map((v, i) => {
            const x = (i / Math.max(1, reveal.series.length - 1)) * 1000;
            const y = 100 - (v / max) * 88 - 6;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");
          return (
            <div style={{ textAlign: "center", animation: "wiz-reveal 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
              <style>{`@keyframes wiz-reveal { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }`}</style>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "16px" }}>Where you stand</div>

              {/* Readiness gauge — ring draws + number counts up on reveal */}
              <div style={{ position: "relative", width: "140px", height: "140px", margin: "0 auto 6px" }}>
                <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-008, rgba(255,255,255,0.08))" strokeWidth="9" />
                  <circle cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={off} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "34px", fontWeight: 700, color, lineHeight: 1 }}>{animProb}%</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>on track</span>
                </div>
              </div>

              <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 auto 18px", lineHeight: 1.6, maxWidth: "360px" }}>{verdict}</p>

              {/* Trajectory shape */}
              <svg width="100%" height="48" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ display: "block", marginBottom: "4px" }}>
                <defs>
                  <linearGradient id="wiz-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${pts} L1000,100 L0,100 Z`} fill="url(#wiz-grad)" />
                <path d={pts} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: "18px" }}>
                <span>Today {fmtFull(reveal.netWorth)}</span>
                <span>Age {reveal.retireAt} · {fmtFull(reveal.projected)}</span>
              </div>

              <button type="button" onClick={dismiss} style={{ ...btnPrimaryStyle, width: "100%", padding: "12px 0", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>
                See my full plan →
              </button>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
                A quick estimate. Your full forecast refines this with taxes, Social Security, and every decision you model.
              </p>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// ── Import grouping helpers ────────────────────────────────────────────────────

type BudgetGroupRow = {
  id: string;              // unique key: category or "sub:<normLabel>"
  label: string;           // display label (editable)
  category: string;        // bucket name
  amount: number;          // editable monthly total
  merchants: { label: string; amount: number }[];
  isSubscription: boolean;
  selected: boolean;
  existingId: string | null;      // matching existing budget item id
  existingAmount: number | null;
  existingLabel: string | null;
};

type ActualsGroupRow = {
  id: string;
  label: string;
  category: string;
  totalAmount: number;
  merchants: { label: string; amount: number }[];
  matchedItemId: string | null;
  isSubscription: boolean;
  expanded: boolean;
};

function groupForBudget(items: ImportedItem[], existingItems: CashFlowItem[]): BudgetGroupRow[] {
  const catMap = new Map<string, { amount: number; merchants: { label: string; amount: number }[] }>();
  const subMap = new Map<string, { amount: number; origLabel: string }>();

  for (const item of items) {
    if (item.type === "income") continue;
    const monthly = toMonthly(item.amount, item.frequency);
    const cat = categoryOf(item);
    if (cat === "Subscriptions") {
      const norm = normLabel(item.label);
      const prev = subMap.get(norm);
      subMap.set(norm, { amount: (prev?.amount ?? 0) + monthly, origLabel: prev?.origLabel ?? item.label });
    } else {
      const g = catMap.get(cat) ?? { amount: 0, merchants: [] };
      g.amount += monthly;
      g.merchants.push({ label: item.label, amount: monthly });
      catMap.set(cat, g);
    }
  }

  function findExisting(cat: string, label?: string): CashFlowItem | undefined {
    if (label) {
      const n = normLabel(label);
      const byLabel = existingItems.find((i) => normLabel(i.label) === n);
      if (byLabel) return byLabel;
    }
    return existingItems.find((i) => categoryOf(i) === cat);
  }

  const catRows: BudgetGroupRow[] = Array.from(catMap.entries()).map(([cat, { amount, merchants }]) => {
    const ex = findExisting(cat);
    return {
      id: cat,
      label: cat,
      category: cat,
      amount: Math.round(amount),
      merchants,
      isSubscription: false,
      selected: !ex,
      existingId: ex?.id ?? null,
      existingAmount: ex ? toMonthly(ex.amount, ex.frequency) : null,
      existingLabel: ex?.label ?? null,
    };
  });

  const subRows: BudgetGroupRow[] = Array.from(subMap.entries()).map(([norm, { amount, origLabel }]) => {
    const ex = existingItems.find((i) => normLabel(i.label) === norm);
    return {
      id: `sub:${norm}`,
      label: origLabel,
      category: "Subscriptions",
      amount: Math.round(amount * 100) / 100,
      merchants: [],
      isSubscription: true,
      selected: !ex,
      existingId: ex?.id ?? null,
      existingAmount: ex ? toMonthly(ex.amount, ex.frequency) : null,
      existingLabel: ex?.label ?? null,
    };
  });

  return [...catRows, ...subRows].sort((a, b) => {
    if (a.isSubscription !== b.isSubscription) return a.isSubscription ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

function groupForActuals(items: ImportedItem[], expenseItems: CashFlowItem[]): ActualsGroupRow[] {
  const catMap = new Map<string, { amount: number; merchants: { label: string; amount: number }[] }>();
  const subMap = new Map<string, { amount: number; origLabel: string }>();

  for (const item of items) {
    if (item.type === "income") continue;
    const monthly = toMonthly(item.amount, item.frequency);
    const cat = categoryOf(item);
    if (cat === "Subscriptions") {
      const norm = normLabel(item.label);
      const prev = subMap.get(norm);
      subMap.set(norm, { amount: (prev?.amount ?? 0) + monthly, origLabel: prev?.origLabel ?? item.label });
    } else {
      const g = catMap.get(cat) ?? { amount: 0, merchants: [] };
      g.amount += monthly;
      g.merchants.push({ label: item.label, amount: monthly });
      catMap.set(cat, g);
    }
  }

  function findBudgetItem(cat: string, label?: string): string | null {
    if (label) {
      const n = normLabel(label);
      const byLabel = expenseItems.find((i) => normLabel(i.label) === n);
      if (byLabel) return byLabel.id;
    }
    const exact = expenseItems.find((i) => i.label === cat);
    if (exact) return exact.id;
    const catMatch = expenseItems.find((i) => categoryOf(i) === cat);
    return catMatch?.id ?? null;
  }

  const catRows: ActualsGroupRow[] = Array.from(catMap.entries()).map(([cat, { amount, merchants }]) => ({
    id: cat,
    label: cat,
    category: cat,
    totalAmount: Math.round(amount * 100) / 100,
    merchants,
    matchedItemId: findBudgetItem(cat),
    isSubscription: false,
    expanded: false,
  }));

  const subRows: ActualsGroupRow[] = Array.from(subMap.entries()).map(([norm, { amount, origLabel }]) => ({
    id: `sub:${norm}`,
    label: origLabel,
    category: "Subscriptions",
    totalAmount: Math.round(amount * 100) / 100,
    merchants: [],
    matchedItemId: findBudgetItem("Subscriptions", origLabel),
    isSubscription: true,
    expanded: false,
  }));

  return [...catRows, ...subRows].sort((a, b) => {
    if (a.isSubscription !== b.isSubscription) return a.isSubscription ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

// ── AI Import Panel ───────────────────────────────────────────────────────────

type AiImportPanelProps = {
  existingItems: CashFlowItem[];
  onAdd: (rows: BudgetGroupRow[]) => Promise<void>;
};

function AiImportPanel({ existingItems, onAdd }: AiImportPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [allParsed, setAllParsed] = useState<ImportedItem[]>([]);
  const [preview, setPreview] = useState<BudgetGroupRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/planning/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, mode: "statement" }),
      });
      const data = await res.json() as { items?: ImportedItem[]; error?: string };
      if (!res.ok || data.error) { setParseError(data.error ?? "Something went wrong."); return; }
      if (!data.items || data.items.length === 0) {
        setParseError("No expense items detected. Try pasting more of your statement.");
        return;
      }
      const merged = [...allParsed, ...data.items];
      setAllParsed(merged);
      setPreview(groupForBudget(merged, existingItems));
      setRawText("");
      setStep("review");
    } catch {
      setParseError("Network error — please try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleAdd() {
    const selected = preview.filter((r) => r.selected);
    if (selected.length === 0) return;
    setAdding(true);
    try {
      await onAdd(selected);
      setAddedCount(selected.length);
      setStep("done");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  function reset() {
    setOpen(false); setStep("paste"); setRawText(""); setAllParsed([]);
    setPreview([]); setParseError(null); setAddedCount(null);
  }

  function updateRow(idx: number, patch: Partial<BudgetGroupRow>) {
    setPreview((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setStep("paste"); setAddedCount(null); }}
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
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8M5 7l3 3 3-3M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Build budget from last month&apos;s statement
      </button>
    );
  }

  const selectedCount = preview.filter((r) => r.selected).length;
  const existingCount = preview.filter((r) => r.existingId).length;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Budget Setup from Statement</span>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0" }}>
            {step === "paste"
              ? "Atlas groups spending by category and estimates monthly targets. Existing budget items won't be touched."
              : `${allParsed.length} transactions analyzed across ${allParsed.length > 0 ? "your statement(s)" : "0 statements"}.`}
          </p>
        </div>
        <button type="button" onClick={reset}
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>
          ×
        </button>
      </div>

      {/* Done state */}
      {step === "done" && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ fontSize: "20px", marginBottom: "6px", color: "var(--green)" }}>✓</div>
          <p style={{ fontSize: "13px", color: "var(--green)", fontFamily: "var(--font-body)", margin: 0, fontWeight: 600 }}>
            {addedCount} budget item{addedCount !== 1 ? "s" : ""} added
          </p>
          <button type="button" onClick={reset}
            style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)" }}>
            Done
          </button>
        </div>
      )}

      {/* Review step */}
      {step === "review" && (
        <>
          {existingCount > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", fontSize: "11px", color: "oklch(0.65 0.18 270)", fontFamily: "var(--font-body)" }}>
              {existingCount} categor{existingCount !== 1 ? "ies" : "y"} already in your budget — pre-deselected. Re-check to add alongside or update manually.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px", padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
              {["", "Category / Item", "Monthly ($)"].map((h, i) => (
                <span key={i} style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
              ))}
            </div>

            {preview.map((row, idx) => (
              <div key={row.id} style={{
                borderBottom: "1px solid var(--border-subtle)",
                opacity: row.selected ? 1 : 0.45,
                background: row.existingId ? "rgba(99,102,241,0.03)" : "transparent",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px", alignItems: "center", padding: "7px 6px", gap: "8px" }}>
                  <input type="checkbox" checked={row.selected} onChange={() => updateRow(idx, { selected: !row.selected })}
                    style={{ accentColor: "var(--brand-blue)", cursor: "pointer" }} />
                  <div style={{ minWidth: 0 }}>
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(idx, { label: e.target.value })}
                      style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "2px 4px", width: "100%", outline: "none", boxSizing: "border-box" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                    />
                    {row.isSubscription ? (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Subscription</span>
                    ) : row.merchants.length > 0 ? (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                        {row.merchants.slice(0, 3).map((m) => m.label).join(", ")}{row.merchants.length > 3 ? ` +${row.merchants.length - 3} more` : ""}
                      </span>
                    ) : null}
                    {row.existingId && (
                      <span style={{ fontSize: "10px", color: "oklch(0.65 0.18 270)", fontFamily: "var(--font-body)", marginLeft: "4px" }}>
                        · exists: {row.existingLabel} ${row.existingAmount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                      </span>
                    )}
                  </div>
                  <input
                    type="number" min={0} step={0.01}
                    value={row.amount}
                    onChange={(e) => updateRow(idx, { amount: Number(e.target.value) })}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 4px", width: "100%", textAlign: "right", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={handleAdd} disabled={adding || selectedCount === 0}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: selectedCount === 0 ? "var(--border-subtle)" : "var(--brand-blue)", color: selectedCount === 0 ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: selectedCount === 0 ? "default" : "pointer" }}>
              {adding ? "Adding…" : `Add ${selectedCount} to Budget`}
            </button>
            <button type="button" onClick={() => setStep("paste")}
              style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
              + Add Another Statement
            </button>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginLeft: "auto" }}>
              {selectedCount} of {preview.length} selected
            </span>
          </div>
        </>
      )}

      {/* Paste step */}
      {step === "paste" && (
        <>
          {allParsed.length > 0 && (
            <div style={{ padding: "6px 10px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", fontSize: "11px", color: "#22c55e", fontFamily: "var(--font-body)" }}>
              {allParsed.length} transactions already loaded — paste another statement to add to the mix.
            </div>
          )}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Paste a credit card or bank statement — CSV export, copied transactions, or plain text. Atlas groups charges by category automatically."}
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", padding: "10px 12px", resize: "vertical", outline: "none", lineHeight: 1.6 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          {parseError && <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{parseError}</p>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleParse} disabled={parsing || !rawText.trim()}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: !rawText.trim() || parsing ? "var(--border-subtle)" : "var(--brand-blue)", color: !rawText.trim() || parsing ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: !rawText.trim() || parsing ? "default" : "pointer" }}>
              {parsing ? "Analyzing…" : "Analyze with Atlas"}
            </button>
            {allParsed.length > 0 && (
              <button type="button" onClick={() => setStep("review")}
                style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
                Back to Review
              </button>
            )}
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

type ScenarioPanelProps = {
  cfg: ScenarioCfg;
  setCfg: React.Dispatch<React.SetStateAction<ScenarioCfg>>;
  color: string;
  result: { retPt: { baseline: number; annualExpenses: number } | undefined; prob: number | null; sr: number };
  currentAge: number | null;
  effectiveIncome: number;
  defaultMonthlySavings: number;
};

function ScenarioPanel({ cfg, setCfg, color, result, currentAge, effectiveIncome, defaultMonthlySavings }: ScenarioPanelProps) {
  const minAge = (currentAge ?? 25) + 2;
  const savingsMax = Math.max(Math.round(effectiveIncome * 0.8), defaultMonthlySavings + 2000);

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
          <input type="range" min={0} max={savingsMax} step={100} value={cfg.monthlySavings}
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
    const base = { retirementAge: baseRetire, monthlySavings: defaultMonthlySavings, returnRate: defaultReturnRate };
    if (preset === "early-late") {
      setCfgA({ ...base, label: "Early Retirement", retirementAge: Math.max((currentAge ?? 30) + 5, baseRetire - 7) });
      setCfgB({ ...base, label: "Late Retirement", retirementAge: Math.min(baseRetire + 7, 75) });
    } else if (preset === "save-more") {
      setCfgA({ ...base, label: "Save More", monthlySavings: Math.round(defaultMonthlySavings * 1.25) });
      setCfgB({ ...base, label: "Current Pace" });
    } else {
      setCfgA({ ...base, label: "Bull Market", returnRate: Math.min(defaultReturnRate + 3, 14) });
      setCfgB({ ...base, label: "Bear Market", returnRate: Math.max(defaultReturnRate - 3, 2) });
    }
  }

  // Each path can include or exclude individual committed life decisions, so you can
  // literally compare "buy the house" vs "skip it." Default: every event in both paths.
  const [excludedA, setExcludedA] = useState<Set<string>>(new Set());
  const [excludedB, setExcludedB] = useState<Set<string>>(new Set());
  function toggleEvent(which: "a" | "b", id: string) {
    const setter = which === "a" ? setExcludedA : setExcludedB;
    setter((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function scenarioResult(cfg: ScenarioCfg, excluded: Set<string>) {
    const age = currentAge ?? 35;
    const yrs = Math.max(1, cfg.retirementAge - age);
    const expensesForCalc = effectiveExpenses - defaultMonthlySavings + cfg.monthlySavings;
    const incomeForCalc = effectiveIncome + (cfg.monthlySavings - defaultMonthlySavings);
    const events = excluded.size > 0 ? futureEvents.filter((e) => !excluded.has(e.id)) : futureEvents;
    const bands = buildForecastBands(
      netWorth, incomeForCalc, expensesForCalc, yrs,
      cfg.returnRate / 100, defaultInflation / 100, defaultSalaryGrowth / 100,
      events, currentYear,
    );
    const retPt = bands[bands.length - 1];
    const prob = retPt ? calcRetirementProbability(retPt.baseline, retPt.annualExpenses) : null;
    const target = retPt ? retPt.annualExpenses * 25 : 0;
    const sr = incomeForCalc > 0 ? ((cfg.monthlySavings / incomeForCalc) * 100) : 0;
    return { bands, retPt, prob, target, yrs, sr };
  }

  const resA = useMemo(() => scenarioResult(cfgA, excludedA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgA, excludedA, currentAge, netWorth, effectiveIncome, effectiveExpenses,
     defaultInflation, defaultSalaryGrowth, defaultMonthlySavings, futureEvents, currentYear]);

  const resB = useMemo(() => scenarioResult(cfgB, excludedB),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgB, excludedB, currentAge, netWorth, effectiveIncome, effectiveExpenses,
     defaultInflation, defaultSalaryGrowth, defaultMonthlySavings, futureEvents, currentYear]);

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
      <div className="compare-paths-row" style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <ScenarioPanel cfg={cfgA} setCfg={setCfgA} color={BLUE} result={resA}
          currentAge={currentAge} effectiveIncome={effectiveIncome} defaultMonthlySavings={defaultMonthlySavings} />
        <div className="compare-paths-divider" style={{ width: "1px", background: "var(--border-subtle)", alignSelf: "stretch", flexShrink: 0 }} />
        <ScenarioPanel cfg={cfgB} setCfg={setCfgB} color={VIOLET} result={resB}
          currentAge={currentAge} effectiveIncome={effectiveIncome} defaultMonthlySavings={defaultMonthlySavings} />
      </div>

      {/* Life decisions in each path — compare "buy the house" vs "skip it" */}
      {futureEvents.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Life decisions in each path</span>
            <div style={{ display: "flex", gap: "18px", fontSize: "10px", fontFamily: "var(--font-body)" }}>
              <span style={{ color: BLUE, fontWeight: 700 }}>{cfgA.label}</span>
              <span style={{ color: VIOLET, fontWeight: 700 }}>{cfgB.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {futureEvents.map((e) => {
              const inA = !excludedA.has(e.id), inB = !excludedB.has(e.id);
              const Pill = ({ on, color, onClick }: { on: boolean; color: string; onClick: () => void }) => (
                <button type="button" onClick={onClick} aria-pressed={on}
                  style={{ width: "26px", height: "20px", borderRadius: "6px", cursor: "pointer", flexShrink: 0, fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
                    border: `1px solid ${on ? color : "var(--border-subtle)"}`, background: on ? `color-mix(in oklch, ${color} 18%, transparent)` : "transparent", color: on ? color : "var(--text-muted)" }}>
                  {on ? "✓" : ""}
                </button>
              );
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.label} <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>· {e.event_year} · {e.amount_impact >= 0 ? "+" : ""}{fmt(e.amount_impact)}{e.recurring_annual ? "/yr" : ""}</span>
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Pill on={inA} color={BLUE} onClick={() => toggleEvent("a", e.id)} />
                    <Pill on={inB} color={VIOLET} onClick={() => toggleEvent("b", e.id)} />
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "8px 0 0", lineHeight: 1.5 }}>Toggle a decision off in one path to see the difference it makes — e.g. include the home purchase in A, leave it out of B.</p>
        </div>
      )}

      {/* Plain-English verdict — which path wins and what it costs */}
      {(() => {
        const pa = resA.prob, pb = resB.prob;
        const nwa = resA.retPt?.baseline ?? null, nwb = resB.retPt?.baseline ?? null;
        if (pa == null || pb == null || nwa == null || nwb == null) return null;
        const aBetter = pa !== pb ? pa > pb : nwa >= nwb;
        const win = aBetter ? cfgA : cfgB, lose = aBetter ? cfgB : cfgA;
        const winRes = aBetter ? resA : resB, loseRes = aBetter ? resB : resA;
        const winColor = aBetter ? BLUE : VIOLET;
        const probGap = Math.abs((winRes.prob ?? 0) - (loseRes.prob ?? 0));
        const nwGap = Math.abs((winRes.retPt?.baseline ?? 0) - (loseRes.retPt?.baseline ?? 0));
        const diffs: string[] = [];
        if (win.retirementAge !== lose.retirementAge) diffs.push(`${win.retirementAge < lose.retirementAge ? "retires" : "works"} ${Math.abs(win.retirementAge - lose.retirementAge)} ${Math.abs(win.retirementAge - lose.retirementAge) === 1 ? "year" : "years"} ${win.retirementAge < lose.retirementAge ? "earlier" : "longer"}`);
        if (Math.abs(win.monthlySavings - lose.monthlySavings) >= 50) diffs.push(`saves ${fmt(Math.abs(win.monthlySavings - lose.monthlySavings))}/mo ${win.monthlySavings > lose.monthlySavings ? "more" : "less"}`);
        if (Math.abs(win.returnRate - lose.returnRate) >= 0.5) diffs.push(`assumes ${Math.abs(win.returnRate - lose.returnRate).toFixed(1)}pp ${win.returnRate > lose.returnRate ? "higher" : "lower"} returns`);
        const same = probGap < 1 && nwGap < 5000;
        return (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>The verdict</div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>
              {same ? (
                <>Both paths land in nearly the same place — about <strong style={{ color: "var(--text-primary)" }}>{winRes.prob}%</strong> on-track. The choice comes down to lifestyle, not math.</>
              ) : (
                <>
                  <strong style={{ color: winColor }}>{win.label}</strong> comes out ahead — <strong style={{ color: "var(--text-primary)" }}>{winRes.prob}%</strong> on-track vs {loseRes.prob}%
                  {probGap >= 1 && <> (a {Math.round(probGap)}-point edge)</>}, ending with <strong style={{ color: "var(--text-primary)" }}>{fmt(winRes.retPt?.baseline ?? 0)}</strong>
                  {nwGap >= 5000 && <> ({fmt(nwGap)} more)</>} at retirement.
                  {diffs.length > 0 && <> It {diffs.join(", ")}.</>}
                </>
              )}
            </p>
          </div>
        );
      })()}

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

// ── Estate & Will ────────────────────────────────────────────────────────────

const DOC_STATUSES = [
  { value: "none",       label: "Not started",  color: "var(--text-muted)" },
  { value: "draft",      label: "Draft",         color: "#f59e0b" },
  { value: "signed",     label: "Signed",        color: "#3b82f6" },
  { value: "notarized",  label: "Notarized",     color: "#8b5cf6" },
  { value: "filed",      label: "Filed",         color: "var(--green)" },
] as const;

const DOCS: { key: keyof Pick<EstateProfile, "doc_will"|"doc_living_trust"|"doc_durable_poa"|"doc_healthcare_directive"|"doc_beneficiary_desig"|"doc_digital_assets">; label: string; description: string }[] = [
  { key: "doc_will",                 label: "Last Will & Testament",        description: "Distributes assets, names executor and guardians" },
  { key: "doc_living_trust",         label: "Living Trust",                 description: "Avoids probate, controls asset distribution" },
  { key: "doc_durable_poa",          label: "Durable Power of Attorney",    description: "Authorizes someone to manage finances if incapacitated" },
  { key: "doc_healthcare_directive", label: "Healthcare Directive / POA",   description: "Medical decisions and end-of-life instructions" },
  { key: "doc_beneficiary_desig",    label: "Beneficiary Designations",     description: "Named on accounts, retirement plans, and insurance" },
  { key: "doc_digital_assets",       label: "Digital Assets Inventory",     description: "Passwords, crypto, online accounts list" },
];

const RELATIONSHIPS = ["Spouse","Partner","Child","Parent","Sibling","Grandchild","Friend","Charity","Trust","Other"];

function statusColor(val: string): string {
  return DOC_STATUSES.find((s) => s.value === val)?.color ?? "var(--text-muted)";
}
function statusLabel(val: string): string {
  return DOC_STATUSES.find((s) => s.value === val)?.label ?? "Not started";
}

function EstatePlanningTab({
  estateProfile,
  balanceItems,
  portfolioTotalValue,
  isPrivate,
  profileKids,
}: {
  estateProfile: EstateProfile | null;
  balanceItems: BalanceSheetItem[];
  portfolioTotalValue: number;
  isPrivate: boolean;
  profileKids: ProfileKid[];
}) {
  const [editing, setEditing] = useState(!estateProfile);
  const [pending, startTransition] = useTransition();
  const [beneficiaries, setBeneficiaries] = useState<EstateBeneficiary[]>(
    () => estateProfile?.beneficiaries ?? []
  );
  const [addingBenef, setAddingBenef] = useState(false);
  const [newBenef, setNewBenef] = useState<Omit<EstateBeneficiary, "id">>({ name: "", relationship: "Spouse", allocation_pct: 0, notes: "" });
  const [benPending, setBenPending] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Account access state
  const [accounts, setAccounts] = useState<EstateAccount[]>(() => estateProfile?.estate_accounts ?? []);
  const [addingAcct, setAddingAcct] = useState(false);
  const [newAcct, setNewAcct] = useState<Omit<EstateAccount, "id">>({ institution: "", account_type: "Checking", contact: "", notes: "" });
  const [acctPending, setAcctPending] = useState(false);

  // Family instructions state
  const [editingInstr, setEditingInstr] = useState(false);
  const [instrValue, setInstrValue] = useState(estateProfile?.family_instructions ?? "");
  const [instrPending, setInstrPending] = useState(false);
  const [instrMsg, setInstrMsg] = useState("");

  const totalAssets = balanceItems.filter((i) => !i.is_liability).reduce((s, i) => s + i.value, 0) + portfolioTotalValue;
  const totalLiabilities = balanceItems.filter((i) => i.is_liability).reduce((s, i) => s + i.value, 0);
  const estateValue = totalAssets - totalLiabilities;
  const FEDERAL_THRESHOLD = 13_610_000;

  const docComplete = DOCS.filter((d) => (estateProfile?.[d.key] ?? "none") !== "none").length;
  const allocTotal = beneficiaries.reduce((s, b) => s + b.allocation_pct, 0);

  function fmt(n: number) {
    return isPrivate ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  async function saveBeneficiaries(updated: EstateBeneficiary[]) {
    setBenPending(true);
    await upsertEstateBeneficiaries(updated);
    setBenPending(false);
  }

  function addBeneficiary() {
    if (!newBenef.name.trim()) return;
    const updated = [...beneficiaries, { ...newBenef, id: crypto.randomUUID() }];
    setBeneficiaries(updated);
    void saveBeneficiaries(updated);
    setNewBenef({ name: "", relationship: "Spouse", allocation_pct: 0, notes: "" });
    setAddingBenef(false);
  }

  function removeBeneficiary(id: string) {
    const updated = beneficiaries.filter((b) => b.id !== id);
    setBeneficiaries(updated);
    void saveBeneficiaries(updated);
  }

  async function saveAccounts(updated: EstateAccount[]) {
    setAcctPending(true);
    await upsertEstateAccounts(updated);
    setAcctPending(false);
  }

  function addAccount() {
    if (!newAcct.institution.trim()) return;
    const updated = [...accounts, { ...newAcct, id: crypto.randomUUID() }];
    setAccounts(updated);
    void saveAccounts(updated);
    setNewAcct({ institution: "", account_type: "Checking", contact: "", notes: "" });
    setAddingAcct(false);
  }

  function removeAccount(id: string) {
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    void saveAccounts(updated);
  }

  async function saveInstructions() {
    setInstrPending(true);
    await upsertFamilyInstructions(instrValue);
    setInstrPending(false);
    setEditingInstr(false);
    setInstrMsg("Saved.");
    setTimeout(() => setInstrMsg(""), 3000);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: "8px", fontSize: "13px",
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 500, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px",
  };

  const DOC_WEIGHTS: Record<string, number> = {
    doc_will: 20, doc_living_trust: 15, doc_durable_poa: 20,
    doc_healthcare_directive: 20, doc_beneficiary_desig: 15, doc_digital_assets: 10,
  };
  const estateScore = DOCS.reduce((sum, doc) => {
    const status = estateProfile?.[doc.key] ?? "none";
    return status !== "none" ? sum + (DOC_WEIGHTS[doc.key] ?? 0) : sum;
  }, 0);

  const PRIORITY_ORDER: (keyof typeof DOC_WEIGHTS)[] = [
    "doc_will", "doc_durable_poa", "doc_healthcare_directive",
    "doc_beneficiary_desig", "doc_living_trust", "doc_digital_assets",
  ];
  const firstMissing = PRIORITY_ORDER.find((k) => (estateProfile?.[k as keyof EstateProfile] ?? "none") === "none");
  const firstMissingLabel = firstMissing ? DOCS.find((d) => d.key === firstMissing)?.label ?? "" : null;

  const estateFinnInsight = (() => {
    if (!estateProfile) return "Add your estate documents to track readiness and receive personalized guidance.";
    const will = estateProfile.doc_will ?? "none";
    const poa = estateProfile.doc_durable_poa ?? "none";
    const hcd = estateProfile.doc_healthcare_directive ?? "none";
    const ben = estateProfile.doc_beneficiary_desig ?? "none";
    if (will === "none") return "A Last Will & Testament is missing. Without it, state intestacy laws determine how your assets are distributed — not you.";
    if (poa === "none") return "A Durable Power of Attorney is not on file. Without it, no one can legally manage your finances if you are incapacitated.";
    if (hcd === "none") return "A Healthcare Directive is missing. This document ensures your medical wishes are followed when you cannot speak for yourself.";
    if (ben === "none") return "Beneficiary designations override your will on retirement accounts and life insurance. Ensure all financial accounts are designated.";
    if (estateScore >= 80) return "Your estate plan is well-organized. Review it after major life events — marriage, divorce, new children, or significant asset changes.";
    return `Your estate plan covers ${docComplete} of ${DOCS.length} key documents. Complete the remaining items to achieve full readiness.`;
  })();

  const ringCirc = 200;
  const eRingOffset = ringCirc - (estateScore / 100) * ringCirc;
  const eScoreColor = estateScore >= 75 ? "var(--green)" : estateScore >= 45 ? "var(--amber)" : "var(--red)";

  const ACCOUNT_TYPES = ["Checking", "Savings", "Brokerage", "401(k)", "IRA", "Roth IRA", "Life Insurance", "Pension", "HSA", "529 Plan", "Crypto", "Real Estate", "Business", "Other"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header Banner — Protect Your Plan */}
      <div style={{
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        background: "var(--hero-violet-bg)",
        border: "1px solid var(--hero-violet-border)",
        padding: "20px 24px",
        display: "flex", alignItems: "center", gap: "18px",
      }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
          background: "var(--violet-bg)",
          border: "1px solid var(--violet-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L3 6v4c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6L10 2z" stroke="var(--violet)" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Protect Your Plan</div>
          <div style={{ fontSize: "12px", color: "var(--hero-violet-text)", marginTop: "3px", lineHeight: 1.5 }}>
            Document your estate readiness, record where everything is, and leave clear instructions for the people who matter.
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "22px", fontFamily: "var(--font-mono)", fontWeight: 700, color: eScoreColor }}>{estateScore}</div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>readiness</div>
        </div>
      </div>

      {/* Estate Readiness Score */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)", padding: "20px 24px",
        display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap",
      }}>
        <style>{`
          @keyframes er-ring-draw { from { stroke-dashoffset: ${ringCirc}; } }
          .er-ring-fill { animation: er-ring-draw 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        `}</style>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r="31.85" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              className="er-ring-fill"
              cx="36" cy="36" r="31.85" fill="none"
              stroke={eScoreColor} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={eRingOffset}
            />
          </svg>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Estate Readiness</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: eScoreColor, lineHeight: 1 }}>{estateScore}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
              {estateScore >= 80 ? "Well covered" : estateScore >= 50 ? "Gaps remain" : "Needs attention"}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {DOCS.map((doc) => {
            const status = estateProfile?.[doc.key] ?? "none";
            const done = status !== "none";
            const wt = DOC_WEIGHTS[doc.key] ?? 0;
            return (
              <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: done ? "var(--green)" : "rgba(255,255,255,0.1)" }} />
                <span style={{ flex: 1, fontSize: "12px", color: done ? "var(--text-secondary)" : "var(--text-muted)", fontFamily: "var(--font-body)" }}>{doc.label}</span>
                <span style={{ fontSize: "10px", color: done ? eScoreColor : "var(--text-muted)", fontFamily: "var(--font-mono)", fontWeight: done ? 600 : 400 }}>{done ? `+${wt}` : `${wt} pts`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Atlas Estate Insight */}
      <div style={{
        padding: "14px 18px", borderRadius: "var(--radius-lg)",
        background: "color-mix(in oklch, oklch(0.55 0.18 270) 6%, var(--card-bg))",
        border: "1px solid color-mix(in oklch, oklch(0.55 0.18 270) 22%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "oklch(0.65 0.18 270)", flexShrink: 0 }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.65 0.18 270)", fontFamily: "var(--font-body)" }}>Atlas</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{estateFinnInsight}</p>
      </div>

      {/* Recommended Next Step */}
      {firstMissingLabel && (
        <div style={{
          display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
          borderRadius: "var(--radius-lg)", background: "rgba(37,99,235,0.07)",
          border: "1px solid rgba(37,99,235,0.2)",
        }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M3 10l7 7 7-7" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Recommended Next Step</div>
            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Start your {firstMissingLabel}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: "1px" }}>Click Edit below to update your document status</div>
          </div>
        </div>
      )}

      {/* Legal disclaimer */}
      <div style={{
        padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "11px",
        background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)",
        color: "var(--text-muted)", lineHeight: 1.6,
      }}>
        This is an organizational tool only. BuyTune is not a law firm and this is not legal advice.
        Consult a licensed estate attorney in your state for document preparation and legal guidance.
      </div>

      {/* Estate value summary */}
      <div style={{
        display: "flex", gap: "16px", flexWrap: "wrap", padding: "14px 18px",
        borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", border: "1px solid var(--card-border)",
      }}>
        {[
          { label: "Estimated estate value", value: fmt(estateValue), note: "assets minus liabilities" },
          { label: "Federal exemption 2024", value: "$13.6M", note: estateValue >= FEDERAL_THRESHOLD ? "Estate may be taxable" : "Below threshold" },
          { label: "Documents complete", value: `${docComplete}/${DOCS.length}`, note: docComplete === DOCS.length ? "All accounted for" : `${DOCS.length - docComplete} remaining` },
        ].map(({ label, value, note }) => (
          <div key={label} style={{ flex: "1 1 140px" }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: "18px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Documents checklist */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Document Checklist</div>
          <button onClick={() => { setEditing((v) => !v); setSaveMsg(""); }} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
        {editing ? (
          <form
            action={(fd) => {
              // preserve beneficiaries — not part of this form
              startTransition(async () => {
                const result = await upsertEstateProfile(fd);
                if (!result.error) { setEditing(false); setSaveMsg("Saved."); }
              });
            }}
            style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}
          >
            {/* Document status dropdowns */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
              {DOCS.map((doc) => (
                <div key={doc.key}>
                  <div style={labelStyle}>{doc.label}</div>
                  <select name={doc.key} defaultValue={estateProfile?.[doc.key] ?? "none"} style={{ ...inputStyle, width: "100%" }}>
                    {DOC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>{doc.description}</div>
                </div>
              ))}
            </div>

            {/* Key contacts */}
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>Key Contacts</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              {[
                { prefix: "executor",         label: "Executor" },
                { prefix: "attorney",         label: "Estate Attorney" },
                { prefix: "healthcare_proxy", label: "Healthcare Proxy" },
              ].map(({ prefix, label }) => (
                <div key={prefix} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</div>
                  <input name={`${prefix}_name`}  defaultValue={(estateProfile as Record<string, string | null> | null)?.[`${prefix}_name`] ?? ""} placeholder="Name" style={inputStyle} />
                  {prefix !== "healthcare_proxy" && (
                    <input name={`${prefix}_email`} defaultValue={(estateProfile as Record<string, string | null> | null)?.[`${prefix}_email`] ?? ""} placeholder="Email" style={inputStyle} />
                  )}
                </div>
              ))}
            </div>

            {/* Last reviewed + notes */}
            <div className="estate-review-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <div>
                <div style={labelStyle}>Last reviewed</div>
                <input type="date" name="last_reviewed_at" defaultValue={estateProfile?.last_reviewed_at ?? ""} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Notes / instructions</div>
                <textarea name="notes" defaultValue={estateProfile?.notes ?? ""} rows={3} placeholder="e.g. Safe deposit box location, digital password manager, specific bequests…" style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="submit" disabled={pending} style={{ padding: "8px 18px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {pending ? "Saving…" : "Save"}
              </button>
              {saveMsg && <span style={{ fontSize: "12px", color: "var(--green)" }}>{saveMsg}</span>}
            </div>
          </form>
        ) : (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {DOCS.map((doc) => {
              const status = estateProfile?.[doc.key] ?? "none";
              return (
                <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                    background: statusColor(status),
                  }} />
                  <div style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)" }}>{doc.label}</div>
                  <div style={{ fontSize: "11px", fontWeight: 500, color: statusColor(status) }}>{statusLabel(status)}</div>
                </div>
              );
            })}
            {estateProfile?.last_reviewed_at && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                Last reviewed: {estateProfile.last_reviewed_at}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key contacts read view */}
      {!editing && estateProfile && (estateProfile.executor_name || estateProfile.attorney_name || estateProfile.healthcare_proxy_name) && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 18px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Key Contacts</div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Executor",         name: estateProfile.executor_name,         email: estateProfile.executor_email },
              { label: "Estate Attorney",  name: estateProfile.attorney_name,         email: estateProfile.attorney_email },
              { label: "Healthcare Proxy", name: estateProfile.healthcare_proxy_name, email: null },
            ].filter((c) => c.name).map((c) => (
              <div key={c.label} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{c.label}</div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : c.name}</div>
                {c.email && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{isPrivate ? "••••••" : c.email}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiary suggestion from profile kids */}
      {profileKids.length > 0 && beneficiaries.length === 0 && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-lg)", background: "oklch(0.45 0.15 270 / 0.08)", border: "1px solid oklch(0.45 0.15 270 / 0.25)", display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0, background: "oklch(0.45 0.15 270 / 0.15)", border: "1px solid oklch(0.55 0.18 270 / 0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 6v4c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6L10 2z" stroke="oklch(0.7 0.18 270)" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "oklch(0.72 0.15 270)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Dependants in Your Profile</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "8px" }}>
              {profileKids.map((k) => k.name || "Child").join(", ")} {profileKids.length === 1 ? "is" : "are"} listed in your profile but not named as a beneficiary here. Consider adding {profileKids.length === 1 ? "them" : "them"} to your beneficiary designations.
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {profileKids.map((kid, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setNewBenef({ name: kid.name || "Child", relationship: "Child", allocation_pct: 0, notes: "" });
                    setAddingBenef(true);
                  }}
                  style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: "oklch(0.45 0.15 270 / 0.15)", border: "1px solid oklch(0.55 0.18 270 / 0.3)", color: "oklch(0.72 0.15 270)" }}
                >
                  + Add {kid.name || `Child ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Beneficiaries */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Beneficiaries</div>
            {beneficiaries.length > 0 && (
              <div style={{ fontSize: "11px", color: allocTotal === 100 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                {allocTotal}% allocated {allocTotal !== 100 && `— ${allocTotal < 100 ? `${100 - allocTotal}% unallocated` : `${allocTotal - 100}% over`}`}
              </div>
            )}
          </div>
          <button onClick={() => setAddingBenef((v) => !v)} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {addingBenef ? "Cancel" : "+ Add"}
          </button>
        </div>

        {addingBenef && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Name</div>
                <input value={newBenef.name} onChange={(e) => setNewBenef((b) => ({ ...b, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Relationship</div>
                <select value={newBenef.relationship} onChange={(e) => setNewBenef((b) => ({ ...b, relationship: e.target.value }))} style={inputStyle}>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>% Share</div>
                <input type="number" min="0" max="100" value={newBenef.allocation_pct} onChange={(e) => setNewBenef((b) => ({ ...b, allocation_pct: Number(e.target.value) }))} style={inputStyle} />
              </div>
            </div>
            <input value={newBenef.notes} onChange={(e) => setNewBenef((b) => ({ ...b, notes: e.target.value }))} placeholder="Notes (optional)" style={inputStyle} />
            <button onClick={addBeneficiary} disabled={!newBenef.name.trim() || benPending} style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {benPending ? "Saving…" : "Add Beneficiary"}
            </button>
          </div>
        )}

        {beneficiaries.length === 0 && !addingBenef ? (
          <div style={{ padding: "30px 18px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
            No beneficiaries added yet.
          </div>
        ) : (
          <div style={{ padding: "6px 0" }}>
            {beneficiaries.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : b.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{b.relationship}{b.notes && ` · ${b.notes}`}</div>
                </div>
                <div style={{
                  padding: "2px 10px", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700,
                  background: allocTotal === 100 ? "rgba(34,197,94,0.1)" : "var(--bg-elevated)",
                  color: allocTotal === 100 ? "var(--green)" : "var(--text-secondary)",
                }}>
                  {b.allocation_pct}%
                </div>
                <button onClick={() => removeBeneficiary(b.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes read view (kept for doc-edit form notes field) */}
      {!editing && estateProfile?.notes && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 18px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Document Notes</div>
          <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {isPrivate ? "••••••••••••" : estateProfile.notes}
          </div>
        </div>
      )}

      {/* Account Access Planning */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Account Access</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Where your accounts live and how to reach them</div>
          </div>
          <button onClick={() => setAddingAcct((v) => !v)} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {addingAcct ? "Cancel" : "+ Add"}
          </button>
        </div>

        {/* Security notice */}
        <div style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M8 1.5L1.5 13h13L8 1.5z" stroke="rgba(245,158,11,0.9)" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" stroke="rgba(245,158,11,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "11px", color: "oklch(0.78 0.12 80)", lineHeight: 1.55 }}>
            <strong>Do not enter passwords, PINs, or login credentials here.</strong> Record institution names, account types, and customer service numbers only — enough for your family to locate accounts, not to access them.
          </span>
        </div>

        {addingAcct && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Institution</div>
                <input value={newAcct.institution} onChange={(e) => setNewAcct((a) => ({ ...a, institution: e.target.value }))} placeholder="e.g. Fidelity, Chase, Coinbase" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Account type</div>
                <select value={newAcct.account_type} onChange={(e) => setNewAcct((a) => ({ ...a, account_type: e.target.value }))} style={inputStyle}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Customer service number</div>
                <input value={newAcct.contact} onChange={(e) => setNewAcct((a) => ({ ...a, contact: e.target.value }))} placeholder="e.g. 800-555-0100" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Notes</div>
                <input value={newAcct.notes} onChange={(e) => setNewAcct((a) => ({ ...a, notes: e.target.value }))} placeholder="e.g. joint account, in safe deposit box" style={inputStyle} />
              </div>
            </div>
            <button onClick={addAccount} disabled={!newAcct.institution.trim() || acctPending} style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {acctPending ? "Saving…" : "Add Account"}
            </button>
          </div>
        )}

        {accounts.length === 0 && !addingAcct ? (
          <div style={{ padding: "30px 18px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>No accounts recorded yet.</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "300px", margin: "0 auto", lineHeight: 1.6 }}>
              Record where each account lives so your family can find everything quickly.
            </div>
          </div>
        ) : (
          <div style={{ padding: "6px 0" }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : a.institution}</div>
                    <div style={{ fontSize: "10px", padding: "1px 7px", borderRadius: "4px", background: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{a.account_type}</div>
                  </div>
                  {(a.contact || a.notes) && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {isPrivate ? "••••••" : [a.contact, a.notes].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button onClick={() => removeAccount(a.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Family Instructions */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: editingInstr ? "1px solid var(--border-subtle)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Family Instructions</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>What your family needs to know if something happens to you</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {instrMsg && <span style={{ fontSize: "11px", color: "var(--green)" }}>{instrMsg}</span>}
            <button onClick={() => { setEditingInstr((v) => !v); if (!editingInstr) setInstrValue(estateProfile?.family_instructions ?? ""); }} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
              {editingInstr ? "Cancel" : (estateProfile?.family_instructions ? "Edit" : "Add")}
            </button>
          </div>
        </div>

        {editingInstr ? (
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Consider covering: location of important documents, contact your attorney and executor first, passwords in [location], final wishes, and anything else your family needs to navigate without you.
            </div>
            <textarea
              value={instrValue}
              onChange={(e) => setInstrValue(e.target.value)}
              rows={8}
              placeholder="Write freely — this is for your family, not a legal document. Where are your will and trust documents? Who should they call first? Where is the safe deposit box key? What accounts need immediate attention?"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={saveInstructions} disabled={instrPending} style={{ padding: "7px 16px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                {instrPending ? "Saving…" : "Save Instructions"}
              </button>
            </div>
          </div>
        ) : estateProfile?.family_instructions ? (
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {isPrivate ? "••••••••••••" : estateProfile.family_instructions}
            </div>
          </div>
        ) : (
          <div style={{ padding: "24px 18px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>No instructions written yet.</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "340px", margin: "0 auto", lineHeight: 1.6 }}>
              Leave a plain-language guide for the people who will need to act on your behalf. The clearer this is, the easier you make an already difficult time.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cash Flow Health Card ─────────────────────────────────────────────────────

function CashFlowHealthCard({
  cashFlowHealth, savingsRate, effectiveIncome, monthlyExpenses, monthlySavings, cashFlowItems, isPrivate,
}: {
  cashFlowHealth: { total: number; factors: { name: string; score: number; max: number; direction: "strength" | "neutral" | "weakness" }[] };
  savingsRate: number; effectiveIncome: number; monthlyExpenses: number; monthlySavings: number;
  cashFlowItems: CashFlowItem[]; isPrivate: boolean;
}) {
  const [activeFactor, setActiveFactor] = useState<string | null>(null);

  const pHide = (v: string) => isPrivate ? "••••" : v;

  const housing = cashFlowItems
    .filter(i => i.type === "expense" && categoryOf(i) === "Housing")
    .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const housingPct = monthlyExpenses > 0 ? (housing / monthlyExpenses) * 100 : 0;
  const incomeCount = cashFlowItems.filter(i => i.type === "income").length;
  const catBreakdown = EXPENSE_CATEGORIES
    .map(c => ({
      name: c.label,
      amount: cashFlowItems.filter(i => i.type === "expense" && categoryOf(i) === c.label)
        .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0),
    }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const topCat = catBreakdown[0];
  const topCatPct = topCat && monthlyExpenses > 0 ? (topCat.amount / monthlyExpenses) * 100 : 0;

  function getFactorDetails(name: string) {
    const f = cashFlowHealth.factors.find(x => x.name === name);
    if (!f) return null;
    switch (name) {
      case "Savings Rate": {
        const gap = 20 - Math.max(0, savingsRate);
        const monthlyGap = effectiveIncome > 0 ? Math.round(effectiveIncome * (gap / 100)) : 0;
        return {
          icon: "💰",
          what: "% of monthly income saved after expenses. The most direct driver of long-term wealth accumulation.",
          formula: effectiveIncome > 0
            ? `(${pHide(fmt(effectiveIncome))} income − ${pHide(fmt(monthlyExpenses))} expenses) ÷ income = ${savingsRate.toFixed(1)}%`
            : "Add income and expenses to calculate",
          scoring: "Linear: 20%+ savings rate earns the full 30 pts. Each 1% is worth 1.5 pts.",
          improve: savingsRate >= 20
            ? "You're at the top tier. As income grows, keep expenses flat to hold this rate."
            : gap > 0
            ? `Save ${pHide(fmt(monthlyGap))} more/month to reach 20%. Entertainment, dining, and subscriptions move fastest.`
            : "Expenses exceed income. Closing this deficit is the top priority.",
        };
      }
      case "Housing Burden":
        return {
          icon: "🏠",
          what: "Housing costs as a share of total monthly expenses. High burden compresses every other category.",
          formula: monthlyExpenses > 0
            ? `${pHide("$" + Math.round(housing).toLocaleString())} housing ÷ ${pHide(fmt(monthlyExpenses))} expenses = ${housingPct.toFixed(0)}%`
            : "No expense data",
          scoring: "≤30% of expenses = near-full 25 pts. ≥50% = 0 pts. Linear in between.",
          improve: housingPct <= 30
            ? "Housing is well-controlled. Keep it below 30% as income grows."
            : housingPct <= 40
            ? `At ${housingPct.toFixed(0)}%, you're above the 30% target. Grow income or consider whether rent vs. buy math has shifted.`
            : `Housing at ${housingPct.toFixed(0)}% is the dominant constraint. Income growth is the most realistic lever here.`,
        };
      case "Expense Mix":
        return {
          icon: "📊",
          what: "Whether spending is spread across categories or concentrated in one. Concentration creates fragility.",
          formula: topCat
            ? `Largest category: ${topCat.name} at ${topCatPct.toFixed(0)}% of expenses`
            : "No expense data",
          scoring: "The more evenly expenses are spread, the higher the score. Max 25 pts at full diversification.",
          improve: topCatPct <= 25
            ? "Good diversification. This follows naturally from keeping Housing in check."
            : `${topCat?.name ?? "One category"} is at ${topCatPct.toFixed(0)}%. If it's Housing, fixing Housing Burden automatically raises this score too.`,
        };
      case "Income Streams":
        return {
          icon: "📈",
          what: "Number of distinct income sources logged. Multiple streams reduce dependency on any single source.",
          formula: `${incomeCount} income source${incomeCount !== 1 ? "s" : ""} logged`,
          scoring: "1 source = 10 pts. 2 sources = 16 pts. 3+ sources = full 20 pts.",
          improve: incomeCount >= 3
            ? "3+ streams earns full marks. Passive sources (dividends, rental) are the most resilient."
            : incomeCount === 2
            ? "One more source earns full 20/20. Freelance, dividends, or rental income all count."
            : "Add a second income source for +6 pts. Even a small side stream counts.",
        };
      default:
        return null;
    }
  }

  const circ = Math.PI * 2 * 25; // r=25
  const ringColor = cashFlowHealth.total >= 75 ? "oklch(0.72 0.19 145)"
    : cashFlowHealth.total >= 50 ? "oklch(0.75 0.18 70)"
    : "oklch(0.65 0.18 25)";

  return (
    <div className="cf-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "0ms" }}>
      <style>{`
        @keyframes cfh-ring { from { stroke-dashoffset: ${circ.toFixed(1)}; } }
        .cfh-arc { animation: cfh-ring 1.4s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes cfh-bar { from { transform: scaleX(0); } }
        .cfh-bar { animation: cfh-bar 0.9s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
        .cfh-row:hover { background: var(--surface-003); }
      `}</style>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "16px" }}>
        {/* Animated ring */}
        <div style={{ flexShrink: 0, position: "relative", width: "62px", height: "62px" }}>
          <svg width="62" height="62" viewBox="0 0 62 62" fill="none">
            <circle cx="31" cy="31" r="25" stroke="var(--border)" strokeWidth="5" />
            <circle cx="31" cy="31" r="25"
              stroke={ringColor} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ.toFixed(1)}
              strokeDashoffset={(circ - (cashFlowHealth.total / 100) * circ).toFixed(1)}
              transform="rotate(-90 31 31)"
              className="cfh-arc"
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: ringColor }}>
            <CountUp to={cashFlowHealth.total} duration={1400} isPrivate={false} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Cash Flow Health Score</span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>/ 100</span>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 12px", lineHeight: 1.5 }}>
            {cashFlowHealth.total >= 75 ? "Strong fundamentals. Click a factor below to see what's driving it."
              : cashFlowHealth.total >= 50 ? "Solid baseline. Click any factor to see where to improve."
              : "Core cash flow needs attention. Click a factor below for specific steps."}
          </p>

          {/* Factor bars — clickable, staggered */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "6px" }}>
            {cashFlowHealth.factors.map((f, i) => {
              const fColor = f.direction === "strength" ? "oklch(0.72 0.19 145)"
                : f.direction === "neutral" ? "oklch(0.75 0.18 70)"
                : "oklch(0.65 0.18 25)";
              const isActive = activeFactor === f.name;
              const details = getFactorDetails(f.name);
              return (
                <div key={f.name}>
                  <button
                    type="button"
                    className="cfh-row"
                    onClick={() => setActiveFactor(isActive ? null : f.name)}
                    style={{
                      width: "100%", background: isActive ? "rgba(255,255,255,0.04)" : "none",
                      border: `1px solid ${isActive ? fColor + "44" : "transparent"}`,
                      borderRadius: "6px", padding: "6px 7px 8px",
                      cursor: "pointer", textAlign: "left", transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "9px", color: isActive ? "var(--text-secondary)" : "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {details?.icon} {f.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: fColor }}>{f.score}/{f.max}</span>
                        <svg width="7" height="7" viewBox="0 0 20 20" fill={fColor}
                          style={{ transition: "transform 0.2s", transform: isActive ? "rotate(180deg)" : "none", flexShrink: 0 }}>
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div style={{ height: "4px", borderRadius: "2px", background: "var(--border)", overflow: "hidden" }}>
                      <div className="cfh-bar" style={{
                        height: "100%", borderRadius: "2px", background: fColor,
                        transform: `scaleX(${f.score / f.max})`,
                        animationDelay: `${i * 110}ms`,
                      }} />
                    </div>
                  </button>

                  {/* Detail panel */}
                  {isActive && details && (
                    <div style={{
                      margin: "2px 0 4px", padding: "12px 13px",
                      background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
                      border: `1px solid ${fColor}33`,
                    }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.6 }}>{details.what}</p>
                      {details.formula && (
                        <div style={{ padding: "5px 8px", background: "var(--bg-base)", borderRadius: "4px", marginBottom: "8px", overflow: "hidden" }}>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>{details.formula}</span>
                        </div>
                      )}
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "8px", lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Scoring: </span>{details.scoring}
                      </div>
                      <div style={{
                        padding: "8px 10px",
                        background: f.direction === "strength" ? "rgba(0,211,149,0.06)" : f.direction === "neutral" ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)",
                        borderRadius: "6px", border: `1px solid ${fColor}22`,
                      }}>
                        <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                          <span style={{ fontWeight: 600, color: fColor }}>
                            {f.direction === "strength" ? "✓ Strength — " : f.direction === "neutral" ? "→ Opportunity — " : "⚠ Improve — "}
                          </span>
                          {details.improve}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
        {([
          { label: "Monthly Income",   to: effectiveIncome,          color: "var(--green)",   prefix: "$" },
          { label: "Monthly Expenses",  to: monthlyExpenses,          color: "var(--red)",     prefix: "$" },
          { label: "Monthly Savings",   to: Math.abs(monthlySavings), color: monthlySavings >= 0 ? "var(--green)" : "var(--red)", prefix: monthlySavings < 0 ? "-$" : "$" },
        ] as { label: string; to: number; color: string; prefix: string }[]).map(({ label, to, color, prefix }) => (
          <div key={label}>
            <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color, lineHeight: 1 }}>
              <CountUp to={to} prefix={prefix} isPrivate={isPrivate} duration={900} />
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Savings Rate</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, lineHeight: 1, color: savingsRate >= 20 ? "var(--green)" : savingsRate >= 10 ? "var(--amber)" : savingsRate > 0 ? "var(--red)" : "var(--text-muted)" }}>
            {effectiveIncome > 0
              ? <CountUp to={savingsRate} suffix="%" decimals={1} duration={850} isPrivate={isPrivate} />
              : <span style={{ fontSize: "14px" }}>—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Budget Tracker ────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function normLabel(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function StatementImportPanel({
  expenseItems,
  selYear,
  selMonth,
  onClose,
  onDone,
}: {
  expenseItems: CashFlowItem[];
  selYear: number;
  selMonth: number;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActualsGroupRow[] | null>(null);
  const [logging, setLogging] = useState(false);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/planning/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, mode: "statement" }),
      });
      const data = await res.json() as { items?: ImportedItem[]; error?: string };
      if (!res.ok || data.error) { setParseError(data.error ?? "Something went wrong."); return; }
      if (!data.items || data.items.length === 0) {
        setParseError("No transactions found. Try pasting more of your statement.");
        return;
      }
      setPreview(groupForActuals(data.items, expenseItems));
    } catch {
      setParseError("Network error — please try again.");
    } finally {
      setParsing(false);
    }
  }

  function setMatch(idx: number, id: string | null) {
    setPreview((prev) => prev ? prev.map((r, i) => i === idx ? { ...r, matchedItemId: id } : r) : prev);
  }

  function toggleExpand(idx: number) {
    setPreview((prev) => prev ? prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r) : prev);
  }

  async function handleLog() {
    if (!preview) return;
    const toLog = preview.filter((r) => r.matchedItemId !== null);
    if (toLog.length === 0) return;
    setLogging(true);
    try {
      for (const row of toLog) {
        const fd = new FormData();
        fd.set("cash_flow_item_id", row.matchedItemId!);
        fd.set("label", row.label);
        fd.set("period_year", String(selYear));
        fd.set("period_month", String(selMonth));
        fd.set("actual_amount", String(row.totalAmount));
        if (row.merchants.length > 0) {
          fd.set("breakdown", JSON.stringify(row.merchants));
        }
        await logExpenseActual(fd);
      }
      onDone(toLog.length);
    } finally {
      setLogging(false);
    }
  }

  const matchedCount = preview ? preview.filter((r) => r.matchedItemId !== null).length : 0;
  const totalCount = preview ? preview.length : 0;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
            Log Monthly Actuals
          </span>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0" }}>
            Logging for {MONTH_NAMES[selMonth - 1]} {selYear}. Charges are grouped by category and matched to your budget.
          </p>
        </div>
        <button type="button" onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", fontSize: "18px", lineHeight: 1 }}>
          ×
        </button>
      </div>

      {expenseItems.length === 0 ? (
        <div style={{ padding: "16px", textAlign: "center", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Set up budget items in the Cash Flow section first, then log actuals here.
          </p>
        </div>
      ) : preview ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
            {totalCount} categor{totalCount !== 1 ? "ies" : "y"} parsed — <strong>{matchedCount} matched</strong> to your budget. Adjust the &ldquo;Budget Item&rdquo; column, then log actuals.
          </p>

          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 24px", padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)", gap: "8px" }}>
            {["Category / Item", "Budget Item", "Total", ""].map((h, i) => (
              <span key={i} style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {preview.map((row, idx) => (
              <div key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 160px 90px 24px",
                  alignItems: "center", gap: "8px", padding: "7px 8px",
                  background: row.matchedItemId ? "transparent" : "rgba(239,68,68,0.04)",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", margin: 0, fontWeight: 500 }}>{row.label}</p>
                    {row.isSubscription
                      ? <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Subscription</span>
                      : row.merchants.length > 0
                        ? <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{row.merchants.length} merchant{row.merchants.length !== 1 ? "s" : ""}</span>
                        : null}
                  </div>
                  <select
                    value={row.matchedItemId ?? ""}
                    onChange={(e) => setMatch(idx, e.target.value || null)}
                    style={{
                      background: "var(--bg-elevated)", border: `1px solid ${row.matchedItemId ? "var(--border-subtle)" : "rgba(239,68,68,0.3)"}`,
                      borderRadius: "6px", color: row.matchedItemId ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: "var(--font-body)", fontSize: "11px", padding: "3px 6px", width: "100%",
                    }}
                  >
                    <option value="">— Skip —</option>
                    {expenseItems.map((bi) => (
                      <option key={bi.id} value={bi.id}>{bi.label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                    ${row.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {row.merchants.length > 0 ? (
                    <button type="button" onClick={() => toggleExpand(idx)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "12px", padding: "0", lineHeight: 1, textAlign: "center" }}
                      title={row.expanded ? "Collapse" : "Show merchants"}>
                      {row.expanded ? "▲" : "▼"}
                    </button>
                  ) : <span />}
                </div>
                {/* Merchant drill-down */}
                {row.expanded && row.merchants.length > 0 && (
                  <div style={{ padding: "4px 8px 8px 16px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {row.merchants.map((m, mi) => (
                      <div key={mi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>↳ {m.label}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          ${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleLog} disabled={logging || matchedCount === 0}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: matchedCount === 0 ? "var(--border-subtle)" : "var(--brand-blue)", color: matchedCount === 0 ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: matchedCount === 0 ? "default" : "pointer" }}>
              {logging ? "Logging…" : `Log ${matchedCount} Actual${matchedCount !== 1 ? "s" : ""}`}
            </button>
            <button type="button" onClick={() => { setPreview(null); setParseError(null); }}
              style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
              Back
            </button>
            {totalCount - matchedCount > 0 && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginLeft: "auto" }}>
                {totalCount - matchedCount} will be skipped
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Paste your credit card or bank statement — CSV export, copied transactions, or plain text. Atlas groups charges by category automatically."}
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", padding: "10px 12px", resize: "vertical", outline: "none", lineHeight: 1.6 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          {parseError && <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{parseError}</p>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleParse} disabled={parsing || !rawText.trim()}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: !rawText.trim() || parsing ? "var(--border-subtle)" : "var(--brand-blue)", color: !rawText.trim() || parsing ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: !rawText.trim() || parsing ? "default" : "pointer" }}>
              {parsing ? "Parsing…" : "Parse Statement"}
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

function BudgetTrackerTab({
  cashFlowItems,
  expenseActuals,
  isPrivate,
}: {
  cashFlowItems: CashFlowItem[];
  expenseActuals: ExpenseActual[];
  isPrivate: boolean;
}) {
  const router = useRouter();
  const now = new Date();
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [showStatementImport, setShowStatementImport] = useState(false);
  const [statementSuccess, setStatementSuccess] = useState<number | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<Set<string>>(new Set());
  const [movingKey, setMovingKey] = useState<string | null>(null);

  const expenseItems = cashFlowItems.filter((i) => i.type === "expense");

  function getActual(itemId: string): ExpenseActual | undefined {
    return expenseActuals.find(
      (a) => a.cash_flow_item_id === itemId && a.period_year === selYear && a.period_month === selMonth
    );
  }

  function getHistory(itemId: string): ExpenseActual[] {
    return expenseActuals
      .filter((a) => a.cash_flow_item_id === itemId)
      .sort((a, b) => b.period_year !== a.period_year ? b.period_year - a.period_year : b.period_month - a.period_month)
      .slice(0, 6);
  }

  function forecastedMonthly(item: CashFlowItem): number {
    return toMonthly(item.amount, item.frequency);
  }

  const totalForecasted = expenseItems.reduce((s, i) => s + forecastedMonthly(i), 0);
  const totalActual = expenseItems.reduce((s, i) => {
    const a = getActual(i.id);
    return a ? s + a.actual_amount : s;
  }, 0);
  const loggedCount = expenseItems.filter((i) => getActual(i.id)).length;
  const overallVariance = totalActual - totalForecasted;

  async function handleSync(itemId: string) {
    setSyncingId(itemId);
    const fd = new FormData();
    fd.set("cash_flow_item_id", itemId);
    const result = await syncForecastToActuals(itemId);
    if (result.error) {
      setSyncMsg((m) => ({ ...m, [itemId]: result.error! }));
    } else {
      setSyncMsg((m) => ({ ...m, [itemId]: `Forecast updated to $${result.newAmount?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo` }));
    }
    setSyncingId(null);
  }

  function fmt(n: number) {
    return isPrivate ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // Build year options (current year + 1 past year)
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Period selector + Import Statement button */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontWeight: 500 }}>Period:</span>
        <select
          value={selMonth}
          onChange={(e) => setSelMonth(Number(e.target.value))}
          style={{ padding: "5px 10px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "12px" }}
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={selYear}
          onChange={(e) => setSelYear(Number(e.target.value))}
          style={{ padding: "5px 10px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "12px" }}
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          type="button"
          onClick={() => { setShowStatementImport((p) => !p); setStatementSuccess(null); }}
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "8px",
            border: "1px solid var(--card-border)", background: showStatementImport ? "var(--nav-active-bg)" : "var(--card-bg)",
            color: showStatementImport ? "var(--nav-active-text)" : "var(--text-secondary)",
            fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, cursor: "pointer",
            transition: "var(--transition-fast)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Log Actuals from Statement
        </button>
      </div>

      {/* Statement import panel */}
      {showStatementImport && (
        <StatementImportPanel
          expenseItems={expenseItems}
          selYear={selYear}
          selMonth={selMonth}
          onClose={() => setShowStatementImport(false)}
          onDone={(count) => {
            setShowStatementImport(false);
            setStatementSuccess(count);
            router.refresh();
          }}
        />
      )}

      {/* Import success message */}
      {statementSuccess !== null && !showStatementImport && (
        <div style={{
          padding: "10px 14px", borderRadius: "var(--radius-md)",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "12px", color: "#22c55e", fontFamily: "var(--font-body)" }}>
            {statementSuccess} actual{statementSuccess !== 1 ? "s" : ""} logged for {MONTH_NAMES[selMonth - 1]} {selYear}.
          </span>
          <button type="button" onClick={() => setStatementSuccess(null)}
            style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}>
            ×
          </button>
        </div>
      )}

      {/* Summary bar */}
      <div style={{
        display: "flex", gap: "16px", flexWrap: "wrap",
        padding: "14px 18px", borderRadius: "var(--radius-lg)",
        background: "var(--bg-surface)", border: "1px solid var(--card-border)",
      }}>
        {[
          { label: "Budgeted", value: fmt(totalForecasted), color: "var(--text-primary)" },
          { label: "Logged actuals", value: fmt(totalActual), color: "var(--text-primary)" },
          {
            label: loggedCount === expenseItems.length ? "Variance" : `Variance (${loggedCount}/${expenseItems.length} items)`,
            value: loggedCount > 0 ? `${overallVariance >= 0 ? "+" : ""}${fmt(overallVariance)}` : "—",
            color: overallVariance > 0 ? "var(--red)" : overallVariance < 0 ? "var(--green)" : "var(--text-muted)",
          },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: "1 1 120px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontSize: "16px", fontFamily: "var(--font-mono)", fontWeight: 600, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* No expense items */}
      {expenseItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "13px" }}>
          Add expense items in the Cash Flow tab first.
        </div>
      )}

      {/* Per-item rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {expenseItems.map((item) => {
          const actual = getActual(item.id);
          const fcast = forecastedMonthly(item);
          const variance = actual ? actual.actual_amount - fcast : null;
          const history = getHistory(item.id);
          const canSync = history.length >= 3;
          const msg = syncMsg[item.id];

          return (
            <div key={item.id} style={{
              padding: "12px 16px", borderRadius: "var(--radius-md)",
              background: "var(--bg-surface)", border: "1px solid var(--card-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                {/* Name + forecasted */}
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "2px" }}>{item.label}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {fmt(fcast)}/mo forecasted
                    {item.frequency !== "monthly" && <span style={{ marginLeft: "4px", color: "var(--text-tertiary)" }}>(/{freqSuffix(item.frequency)})</span>}
                  </div>
                </div>

                {/* Actual input */}
                <form
                  action={(fd) => {
                    fd.set("cash_flow_item_id", item.id);
                    fd.set("label", item.label);
                    fd.set("period_year", String(selYear));
                    fd.set("period_month", String(selMonth));
                    startTransition(async () => { await logExpenseActual(fd); router.refresh(); });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <input
                    name="actual_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={actual?.actual_amount ?? ""}
                    placeholder={isPrivate ? "••••" : "Actual $"}
                    style={{
                      width: "110px", padding: "5px 8px", borderRadius: "8px", fontSize: "12px",
                      background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)", fontFamily: "var(--font-mono)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    style={{
                      padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                      background: "var(--brand-blue)", color: "#fff", border: "none", cursor: "pointer",
                    }}
                  >
                    Log
                  </button>
                </form>

                {/* Variance badge */}
                {variance !== null && (
                  <div style={{
                    padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    background: variance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    color: variance > 0 ? "var(--red)" : "var(--green)",
                  }}>
                    {variance > 0 ? "+" : ""}{fmt(variance)} {variance > 0 ? "over" : "under"}
                  </div>
                )}

                {/* Sync forecast */}
                {canSync && (
                  <button
                    onClick={() => handleSync(item.id)}
                    disabled={syncingId === item.id}
                    title="Update forecasted amount to your 3-month actual average"
                    style={{
                      padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 500,
                      background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)",
                      cursor: "pointer",
                    }}
                  >
                    {syncingId === item.id ? "Syncing…" : "Sync forecast"}
                  </button>
                )}
              </div>

              {/* Sync feedback */}
              {msg && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: msg.startsWith("Forecast") ? "var(--green)" : "var(--red)" }}>
                  {msg}
                </div>
              )}

              {/* Sparkline history — last 6 months */}
              {history.length > 1 && (
                <div style={{ marginTop: "8px", display: "flex", gap: "6px", alignItems: "flex-end" }}>
                  {history.slice().reverse().map((h, i) => {
                    const barHeight = Math.max(4, Math.min(32, (h.actual_amount / (fcast * 2 || 1)) * 28));
                    const over = h.actual_amount > fcast;
                    return (
                      <div key={i} title={`${MONTH_NAMES[h.period_month - 1]} ${h.period_year}: $${h.actual_amount.toLocaleString()}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <div style={{ width: "18px", height: `${barHeight}px`, borderRadius: "2px", background: over ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)" }} />
                        <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{MONTH_NAMES[h.period_month - 1].slice(0, 1)}</span>
                      </div>
                    );
                  })}
                  <div style={{ width: "1px", background: "var(--border-subtle)", height: "24px", margin: "0 2px" }} />
                  <div style={{ width: "18px", height: "20px", borderRadius: "2px", background: "rgba(99,102,241,0.25)", position: "relative" }} title={`Forecast: $${fcast.toLocaleString()}`}>
                    <span style={{ position: "absolute", bottom: "-14px", fontSize: "9px", color: "var(--text-muted)" }}>F</span>
                  </div>
                </div>
              )}

              {/* Move whole actual — shown when logged without a breakdown */}
              {actual && (!actual.breakdown || actual.breakdown.length === 0) && expenseItems.filter((ei) => ei.id !== item.id).length > 0 && (() => {
                const mKey = `${item.id}:whole`;
                const isMoving = movingKey === mKey;
                const otherItems = expenseItems.filter((ei) => ei.id !== item.id);
                return (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        title="Move to another category"
                        onClick={() => setMovingKey(isMoving ? null : mKey)}
                        style={{ background: isMoving ? "var(--bg-elevated)" : "none", border: isMoving ? "1px solid var(--border-subtle)" : "1px solid transparent", borderRadius: "4px", cursor: "pointer", color: isMoving ? "var(--accent)" : "var(--text-tertiary)", fontSize: "10px", padding: "2px 7px", lineHeight: 1, fontFamily: "var(--font-body)" }}
                      >
                        → Move ${actual.actual_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </button>
                    </div>
                    {isMoving && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>Move to:</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const destId = e.target.value;
                            if (!destId) return;
                            setMovingKey(null);
                            startTransition(async () => {
                              await moveMerchantActual(item.id, destId, item.label, actual.actual_amount, selYear, selMonth);
                              router.refresh();
                            });
                          }}
                          style={{ flex: 1, padding: "4px 6px", borderRadius: "6px", fontSize: "11px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontFamily: "var(--font-body)", cursor: "pointer" }}
                        >
                          <option value="" disabled>Select bucket...</option>
                          {otherItems.map((ei) => (
                            <option key={ei.id} value={ei.id}>{ei.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setMovingKey(null)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}
                        >×</button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Breakdown toggle */}
              {actual?.breakdown && actual.breakdown.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandedBreakdown((prev) => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    })}
                    style={{ marginTop: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", padding: "0", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    {expandedBreakdown.has(item.id) ? "▲" : "▼"} {actual.breakdown.length} merchant{actual.breakdown.length !== 1 ? "s" : ""}
                  </button>
                  {expandedBreakdown.has(item.id) && (
                    <div style={{ marginTop: "4px", paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {actual.breakdown.map((m, mi) => {
                        const mKey = `${item.id}:${mi}`;
                        const isMoving = movingKey === mKey;
                        const otherItems = expenseItems.filter((ei) => ei.id !== item.id);
                        return (
                          <div key={mi} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {m.label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                  ${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {otherItems.length > 0 && (
                                  <button
                                    type="button"
                                    title="Move to another category"
                                    onClick={() => setMovingKey(isMoving ? null : mKey)}
                                    style={{ background: isMoving ? "var(--bg-elevated)" : "none", border: isMoving ? "1px solid var(--border-subtle)" : "none", borderRadius: "4px", cursor: "pointer", color: isMoving ? "var(--accent)" : "var(--text-tertiary)", fontSize: "11px", padding: "2px 5px", lineHeight: 1, fontFamily: "var(--font-mono)" }}
                                  >
                                    →
                                  </button>
                                )}
                              </div>
                            </div>
                            {isMoving && (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "10px" }}>
                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>Move to:</span>
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    const destId = e.target.value;
                                    if (!destId) return;
                                    setMovingKey(null);
                                    startTransition(async () => {
                                      await moveMerchantActual(item.id, destId, m.label, m.amount, selYear, selMonth);
                                      router.refresh();
                                    });
                                  }}
                                  style={{ flex: 1, padding: "4px 6px", borderRadius: "6px", fontSize: "11px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontFamily: "var(--font-body)", cursor: "pointer" }}
                                >
                                  <option value="" disabled>Select bucket...</option>
                                  {otherItems.map((ei) => (
                                    <option key={ei.id} value={ei.id}>{ei.label}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setMovingKey(null)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        Log actuals for 3+ months and use &ldquo;Sync forecast&rdquo; to update your forecasted amount to your real spending average.
      </div>
    </div>
  );
}

// ── Forecast Variance Trend Card ──────────────────────────────────────────────

function ForecastVarianceTrendCard({
  cashFlowItems, expenseActuals, isPrivate,
}: {
  cashFlowItems: CashFlowItem[];
  expenseActuals: ExpenseActual[];
  isPrivate: boolean;
}) {
  const pHide = (v: string) => isPrivate ? "••••" : v;
  const expenseItems = cashFlowItems.filter((i) => i.type === "expense");
  const totalBudgeted = expenseItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);

  const monthSet = new Map<string, { year: number; month: number }>();
  for (const a of expenseActuals) {
    const key = `${a.period_year}-${String(a.period_month).padStart(2, "0")}`;
    if (!monthSet.has(key)) monthSet.set(key, { year: a.period_year, month: a.period_month });
  }
  const months = [...monthSet.values()]
    .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
    .slice(0, 6)
    .reverse();

  const monthData = months.map(({ year, month }) => {
    const monthActuals = expenseActuals.filter((a) => a.period_year === year && a.period_month === month);
    const actual = monthActuals.reduce((s, a) => s + a.actual_amount, 0);
    return { year, month, budgeted: totalBudgeted, actual, variance: actual - totalBudgeted, loggedCount: monthActuals.length };
  });

  const loggedMonths = monthData.filter((m) => m.loggedCount > 0);
  if (loggedMonths.length < 2) return null;

  const avgVariance = loggedMonths.reduce((s, m) => s + m.variance, 0) / loggedMonths.length;
  const maxVal = Math.max(...monthData.map((m) => Math.max(m.budgeted, m.actual, 1)));

  const categoryDelta = new Map<string, number>();
  for (const item of expenseItems) {
    const budget = toMonthly(item.amount, item.frequency);
    const cat = categoryOf(item);
    for (const { year, month } of months) {
      const act = expenseActuals.find(
        (a) => a.cash_flow_item_id === item.id && a.period_year === year && a.period_month === month
      );
      if (act) categoryDelta.set(cat, (categoryDelta.get(cat) ?? 0) + (act.actual_amount - budget));
    }
  }
  const topOverCat = [...categoryDelta.entries()].sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0);

  const trendDir = avgVariance > 100 ? "over" : avgVariance < -100 ? "under" : "on-track";
  const finnLine = trendDir === "over"
    ? (topOverCat
        ? `${loggedMonths.length}-month average is ${pHide(fmt(avgVariance))}/mo over budget — ${topOverCat[0]} is the biggest driver.`
        : `Averaging ${pHide(fmt(avgVariance))}/mo over budget across ${loggedMonths.length} months.`)
    : trendDir === "under"
    ? `Consistently coming in ${pHide(fmt(Math.abs(avgVariance)))}/mo under budget — a healthy cushion.`
    : `Spending is tracking close to budget on average (${avgVariance >= 0 ? "+" : ""}${pHide(fmt(Math.abs(avgVariance)))}/mo).`;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 18px" }}>
      <div style={{ marginBottom: "12px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>Spending Trend</span>
        <span style={{ marginLeft: "8px", fontSize: "10px", color: "var(--text-muted)" }}>{loggedMonths.length} months logged</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
        {monthData.map(({ year, month, budgeted, actual, variance, loggedCount }) => {
          const hasActual = loggedCount > 0;
          const budgetPct = maxVal > 0 ? (budgeted / maxVal) * 100 : 0;
          const actualPct = maxVal > 0 ? (actual / maxVal) * 100 : 0;
          const barFill = !hasActual ? "transparent" : variance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)";
          const varColor = !hasActual ? "var(--text-tertiary)" : variance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)";
          return (
            <div key={`${year}-${month}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", width: "28px", flexShrink: 0 }}>{MONTH_NAMES[month - 1]}</span>
              <div style={{ flex: 1, position: "relative", height: "14px" }}>
                <div style={{ position: "absolute", left: 0, top: "4px", height: "6px", width: `${budgetPct}%`, borderRadius: "3px", background: "var(--border)" }} />
                {hasActual && (
                  <div style={{ position: "absolute", left: 0, top: "4px", height: "6px", width: `${actualPct}%`, borderRadius: "3px", background: barFill, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                )}
              </div>
              <div style={{ width: "72px", textAlign: "right", flexShrink: 0 }}>
                {hasActual
                  ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: varColor }}>{variance >= 0 ? "+" : ""}{isPrivate ? "••••" : `$${Math.abs(Math.round(variance)).toLocaleString()}`}</span>
                  : <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>not logged</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>Avg Monthly Variance</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: avgVariance > 100 ? "var(--red)" : avgVariance < -100 ? "var(--green)" : "var(--text-secondary)" }}>
            {avgVariance >= 0 ? "+" : ""}{isPrivate ? "••••" : `$${Math.abs(Math.round(avgVariance)).toLocaleString()}`}
          </div>
        </div>
        <p style={{ flex: 1, minWidth: "180px", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>{finnLine}</p>
      </div>
    </div>
  );
}

// ── Cash Flow OS ─────────────────────────────────────────────────────────────

const CF_CAT_COLORS: Record<string, string> = {
  "Housing":        "oklch(0.60 0.22 258)",
  "Transportation": "oklch(0.62 0.20 306)",
  "Food & Dining":  "oklch(0.74 0.19 56)",
  "Healthcare":     "oklch(0.68 0.18 163)",
  "Fitness":        "oklch(0.65 0.21 143)",
  "Insurance":      "oklch(0.60 0.14 219)",
  "Utilities":      "oklch(0.74 0.17 97)",
  "Entertainment":  "oklch(0.62 0.24 328)",
  "Travel":         "oklch(0.70 0.18 198)",
  "Subscriptions":  "oklch(0.62 0.19 270)",
  "Childcare":      "oklch(0.72 0.17 42)",
  "Other":          "oklch(0.55 0.05 258)",
};

function cfPolarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function cfArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const gap = 2.0;
  const s = startDeg + gap / 2;
  const e = Math.min(endDeg - gap / 2, startDeg + 359.4);
  if (e <= s + 0.1) return "";
  const start = cfPolarToCart(cx, cy, r, s);
  const end   = cfPolarToCart(cx, cy, r, e);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

// ── Balance Sheet OS ───────────────────────────────────────────────────────────

const LIAB_CAT_COLORS: Record<string, string> = {
  mortgage:        "oklch(0.65 0.18 260)",
  auto_loan:       "oklch(0.62 0.20 306)",
  student_loan:    "oklch(0.72 0.17 97)",
  credit_card:     "oklch(0.65 0.18 25)",
  personal_loan:   "oklch(0.60 0.18 55)",
  other_liability: "oklch(0.58 0.06 260)",
};
const LIAB_CAT_LABELS: Record<string, string> = {
  mortgage: "Mortgage", auto_loan: "Auto Loan", student_loan: "Student Loans",
  credit_card: "Credit Cards", personal_loan: "Personal Loan", other_liability: "Other",
};

function BalanceSheetOS({
  balanceItems, portfolioTotalValue, portfolioAccounts = [], effectiveExpenses, netWorthHistory, isPrivate,
}: {
  balanceItems: BalanceSheetItem[];
  portfolioTotalValue: number;
  portfolioAccounts?: PortfolioAccount[];
  effectiveExpenses: number;
  netWorthHistory: NetWorthSnapshot[];
  isPrivate: boolean;
}) {
  const ph = (v: string) => isPrivate ? "••••" : v;

  const assets      = balanceItems.filter(i => !i.is_liability);
  const liabilities = balanceItems.filter(i => i.is_liability);
  const manualAssets    = assets.reduce((s, i) => s + i.value, 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + i.value, 0);
  const totalAssets = manualAssets + portfolioTotalValue;
  const netWorth    = totalAssets - totalLiabilities;
  const liquidAssets = assets.filter(i => i.category === "cash").reduce((s, i) => s + i.value, 0);
  const debtRatio   = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
  const emergencyMonths = effectiveExpenses > 0 ? liquidAssets / effectiveExpenses : 0;

  const assetBuckets = useMemo(() => computeAssetBuckets(assets, portfolioTotalValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualAssets, portfolioTotalValue]);

  const taxBuckets = useMemo(() => computeTaxBuckets(assets, portfolioAccounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualAssets, portfolioTotalValue, assets, portfolioAccounts]);

  const finnInsight = useMemo(() => computeBalanceFinnInsight({
    liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, assets, portfolioAccounts,
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, portfolioAccounts]);

  const liabBuckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of liabilities) map.set(l.category, (map.get(l.category) ?? 0) + l.value);
    return [...map.entries()].map(([cat, val]) => ({
      cat, val,
      label: LIAB_CAT_LABELS[cat] ?? "Other",
      color: LIAB_CAT_COLORS[cat] ?? "oklch(0.58 0.06 260)",
    })).sort((a, b) => b.val - a.val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalLiabilities]);

  const efPct   = Math.min(100, (emergencyMonths / 6) * 100);
  const efColor = emergencyMonths >= 3 ? "oklch(0.72 0.19 145)" : emergencyMonths >= 1 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)";
  const drPct   = Math.min(100, (debtRatio / 60) * 100);
  const drColor = debtRatio < 20 ? "oklch(0.72 0.19 145)" : debtRatio < 40 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)";
  const nwColor = netWorth >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      <style>{`
        @keyframes bso-in  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bso-bar { from { transform: scaleX(0); } }
        .bso-z { animation: bso-in 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .bso-b { animation: bso-bar 0.85s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
        @media (max-width: 640px) { .bso-kpis { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>

      {/* Zone 1 — KPI Strip */}
      <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px 16px", marginBottom: "10px", animationDelay: "0ms" }}>
        <div className="bso-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px 20px", marginBottom: totalAssets > 0 ? "16px" : 0 }}>
          {([
            { label: "Net Worth",    val: ph(fmt(netWorth)),         color: nwColor },
            { label: "Total Assets", val: ph(fmt(totalAssets)),      color: "oklch(0.72 0.19 145)" },
            { label: "Liabilities",  val: ph(fmt(totalLiabilities)), color: totalLiabilities > 0 ? "oklch(0.65 0.18 25)" : "var(--text-muted)" },
            { label: "Debt Ratio",   val: totalAssets > 0 ? `${debtRatio.toFixed(0)}%` : "—", color: drColor },
          ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "5px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>
        {totalAssets > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {effectiveExpenses > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Emergency Fund</span>
                  <span style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{isPrivate ? "••" : emergencyMonths.toFixed(1)}mo{emergencyMonths >= 3 ? " — on track" : " — target 3m"}</span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${(1/6)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div style={{ position: "absolute", left: `${(3/6)*100}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.2)" }} />
                  <div className="bso-b" style={{ height: "100%", borderRadius: "3px", background: `linear-gradient(90deg, oklch(0.60 0.20 258), ${efColor})`, width: `${efPct}%` }} />
                </div>
              </div>
            )}
            {totalLiabilities > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Debt-to-Asset Ratio</span>
                  <span style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Target: below 20%</span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${(20/60)*100}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.2)" }} />
                  <div style={{ position: "absolute", left: `${(40/60)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div className="bso-b" style={{ height: "100%", borderRadius: "3px", background: `linear-gradient(90deg, ${drColor}, ${drColor})`, width: `${drPct}%`, animationDelay: "80ms" }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Atlas strip */}
      <div className="bso-z" style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px", animationDelay: "60ms", display: "flex", gap: "11px", alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/><path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "3px" }}>Atlas</div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>{finnInsight}</p>
        </div>
      </div>

      {/* Zone 2 — Asset Allocation + Liability Breakdown */}
      {(assetBuckets.length > 0 || liabBuckets.length > 0) && (
        <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px", animationDelay: "110ms" }}>
          {assetBuckets.length > 0 && (
            <div style={{ marginBottom: liabBuckets.length > 0 ? "20px" : 0 }}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "10px" }}>Asset Allocation</div>
              {(() => {
                const total = assetBuckets.reduce((s, b) => s + b.value, 0);
                return (
                  <>
                    <div style={{ height: "14px", borderRadius: "7px", overflow: "hidden", display: "flex", marginBottom: "12px" }}>
                      {assetBuckets.map(b => (
                        <div key={b.label} className="bso-b" style={{ flex: `0 0 ${(b.value / total) * 100}%`, background: b.color }} title={`${b.label}: ${fmt(b.value)}`} />
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px" }}>
                      {assetBuckets.map(b => (
                        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{b.label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)" }}>{ph(fmt(b.value))}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>({total > 0 ? ((b.value / total) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {liabBuckets.length > 0 && (
            <div>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "10px" }}>Liability Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {liabBuckets.map((b, i) => {
                  const w = totalLiabilities > 0 ? (b.val / totalLiabilities) * 100 : 0;
                  return (
                    <div key={b.cat}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1 }}>{b.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: b.color }}>{ph(fmt(b.val))}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{w.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: "4px", borderRadius: "2px", background: "var(--surface-006)" }}>
                        <div className="bso-b" style={{ height: "100%", borderRadius: "2px", background: b.color + "88", width: `${w}%`, animationDelay: `${110 + i * 40}ms` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zone 2.5 — Tax Diversification (foundation for tax-aware retirement) */}
      {taxBuckets.total > 0 && (
        <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px", animationDelay: "130ms" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Tax Diversification</span>
            <InfoTooltip text="Where your money sits across the three tax buckets. Having balances in each gives you levers to control how much income is taxable in retirement — and which accounts to draw from first. Tag accounts in the list below (or we infer it from the account type)." />
          </div>
          {(() => {
            const segs = ([
              ["taxable", taxBuckets.taxable] as const,
              ["tax_deferred", taxBuckets.tax_deferred] as const,
              ["tax_free", taxBuckets.tax_free] as const,
            ]).filter(([, v]) => v > 0);
            return (
              <>
                <div style={{ height: "14px", borderRadius: "7px", overflow: "hidden", display: "flex", marginBottom: "12px" }}>
                  {segs.map(([k, v]) => (
                    <div key={k} className="bso-b" style={{ flex: `0 0 ${(v / taxBuckets.total) * 100}%`, background: TAX_BUCKET_META[k].color }} title={`${TAX_BUCKET_META[k].label}: ${fmt(v)}`} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginBottom: "12px" }}>
                  {segs.map(([k, v]) => (
                    <div key={k} title={TAX_BUCKET_META[k].note} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: TAX_BUCKET_META[k].color, flexShrink: 0 }} />
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{TAX_BUCKET_META[k].label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)" }}>{ph(fmt(v))}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>({((v / taxBuckets.total) * 100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55, fontFamily: "var(--font-body)" }}>
                  {taxDiversificationInsight(taxBuckets)}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* Portfolio auto-include notice */}
      {portfolioTotalValue > 0 && (
        <div className="bso-z" style={{ padding: "9px 14px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.18)", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", marginBottom: "10px", animationDelay: "140ms" }}>
          <strong style={{ color: "oklch(0.72 0.19 145)" }}>BuyTune portfolios sync automatically</strong> — each is listed in Assets below and classified by its account type (a Roth IRA counts as tax-free).
        </div>
      )}

      {/* Zone 3 — Lists + Net Worth */}
      <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", animationDelay: "160ms" }}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Assets</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "oklch(0.72 0.19 145)", fontWeight: 600 }}>{ph(fmt(totalAssets))}</span>
          </div>
          {/* Linked BuyTune portfolios — read-only, auto-valued, classified by account type */}
          {portfolioAccounts.filter((pa) => pa.value > 0).map((pa) => {
            const bucket = accountTypeTaxBucket(pa.account_type);
            const meta = TAX_BUCKET_META[bucket];
            return (
              <div key={pa.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pa.name}</span>
                  <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--brand-blue)", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(96,165,250,0.25)", padding: "1px 6px", borderRadius: "999px", flexShrink: 0, whiteSpace: "nowrap" }}>BuyTune{pa.account_type ? ` · ${pa.account_type}` : ""}</span>
                  <span title={meta.note} style={{ fontSize: "9px", fontWeight: 600, color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 35%, transparent)`, padding: "1px 6px", borderRadius: "999px", flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>{ph(fmtFull(pa.value))}</span>
              </div>
            );
          })}
          {assets.map(item => <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} isPrivate={isPrivate} />)}
          <div style={{ marginTop: "10px" }}><AddItemRow type="balance" placeholder="e.g. Checking account" onAdd={addBalanceSheetItem} /></div>
        </div>
        <div style={{ marginBottom: "20px", paddingTop: "4px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingTop: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Liabilities</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: totalLiabilities > 0 ? "oklch(0.65 0.18 25)" : "var(--text-muted)", fontWeight: 600 }}>{ph(fmt(totalLiabilities))}</span>
          </div>
          {liabilities.map(item => <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} isPrivate={isPrivate} />)}
          <div style={{ marginTop: "10px" }}><AddItemRow type="balance" sectionType="liability" placeholder="e.g. Student loan" onAdd={addBalanceSheetItem} /></div>
        </div>
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>Net Worth</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: nwColor }}>{ph(fmt(netWorth))}</span>
        </div>
      </div>

    </div>
  );
}

function BillCalendar({ cashFlowItems, year, month }: { cashFlowItems: CashFlowItem[]; year: number; month: number }) {
  const [tip, setTip] = useState<string | null>(null);
  const itemsWithDay = cashFlowItems.filter(i => i.due_day != null);
  if (itemsWithDay.length === 0) return (
    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
      Set a due day on any income or expense item to see it here.
    </p>
  );
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dayMap = new Map<number, CashFlowItem[]>();
  for (const item of itemsWithDay) {
    const d = item.due_day!;
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(item);
  }
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();
  const isNow = today.getFullYear() === year && today.getMonth() + 1 === month;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: "2px" }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-body)", paddingBottom: "2px" }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? (dayMap.get(day) ?? []) : [];
          const isToday = isNow && day === today.getDate();
          return (
            <div key={i}
              onMouseEnter={() => items.length > 0 && setTip(items.map(it => `${it.label}: ${fmtFull(it.frequency === "annual" ? it.amount / 12 : it.amount)}/mo`).join(" · "))}
              onMouseLeave={() => setTip(null)}
              style={{
                minHeight: "26px", borderRadius: "4px", padding: "2px 1px",
                background: isToday ? "rgba(99,102,241,0.1)" : items.length > 0 ? "rgba(255,255,255,0.03)" : "transparent",
                border: isToday ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                cursor: items.length > 0 ? "default" : "default",
              }}>
              {day && (
                <>
                  <div style={{ textAlign: "center", fontSize: "9px", fontFamily: "var(--font-mono)", color: isToday ? "oklch(0.65 0.18 260)" : "var(--text-tertiary)" }}>{day}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "1px" }}>
                    {items.map((it, j) => (
                      <div key={j} style={{ height: "3px", borderRadius: "2px", background: it.type === "income" ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {tip && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", padding: "6px 10px", background: "var(--surface-004)", borderRadius: "6px" }}>{tip}</div>
      )}
      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          <span style={{ width: "8px", height: "3px", borderRadius: "2px", display: "inline-block", background: "oklch(0.72 0.19 145)" }} /> Income
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          <span style={{ width: "8px", height: "3px", borderRadius: "2px", display: "inline-block", background: "oklch(0.65 0.18 25)" }} /> Expense
        </span>
      </div>
    </div>
  );
}

function FiftyThirtyTwenty({
  needsMonthly, wantsMonthly, incomeMonthly, isPrivate,
}: {
  needsMonthly: number; wantsMonthly: number; incomeMonthly: number; isPrivate: boolean;
}) {
  const ph = (v: string) => (isPrivate ? "••••" : v);
  const savingsMonthly = incomeMonthly - needsMonthly - wantsMonthly;
  const pctOf = (v: number) => (incomeMonthly > 0 ? (v / incomeMonthly) * 100 : 0);

  const rows = [
    {
      key: "needs", label: "Needs", target: 50, value: needsMonthly, pct: pctOf(needsMonthly),
      good: (p: number) => p <= 52, warn: (p: number) => p <= 60,
      hint: "Housing, food, transport, insurance, utilities, healthcare, childcare",
    },
    {
      key: "wants", label: "Wants", target: 30, value: wantsMonthly, pct: pctOf(wantsMonthly),
      good: (p: number) => p <= 32, warn: (p: number) => p <= 40,
      hint: "Entertainment, travel, fitness, subscriptions, other discretionary",
    },
    {
      key: "savings", label: "Savings", target: 20, value: savingsMonthly, pct: pctOf(savingsMonthly),
      good: (p: number) => p >= 20, warn: (p: number) => p >= 10,
      hint: "What's left after needs and wants — invest it or pay down debt",
    },
  ];

  function statusColor(r: typeof rows[number]): string {
    if (r.good(r.pct)) return "oklch(0.72 0.19 145)";   // green
    if (r.warn(r.pct)) return "oklch(0.75 0.18 70)";    // amber
    return "oklch(0.65 0.18 25)";                        // red
  }

  if (incomeMonthly <= 0) return null;

  const onTrack = rows.filter((r) => r.good(r.pct)).length;
  const verdict = onTrack === 3
    ? "Textbook balance — you're hitting all three targets."
    : onTrack === 0
    ? "Your split is off the 50/30/20 guide on every front. Start with the largest gap."
    : `${onTrack} of 3 on target. ${rows.find((r) => !r.good(r.pct))?.label} is the one to work on.`;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>50 / 30 / 20 Balance</span>
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>% of income</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
        {rows.map((r) => {
          const color = statusColor(r);
          const barPct = Math.min(100, Math.max(0, r.pct));
          const targetMarker = Math.min(100, r.target);
          return (
            <div key={r.key}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "5px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{r.label}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>target {r.target}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{ph(`${r.pct.toFixed(0)}%`)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{ph(fmt(Math.round(r.value)))}/mo</span>
                </div>
              </div>
              {/* Bar with target marker */}
              <div style={{ position: "relative", height: "7px", background: "var(--bg-elevated, rgba(255,255,255,0.05))", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${barPct}%`, background: color, borderRadius: "4px", transition: "width 0.4s ease" }} />
              </div>
              <div style={{ position: "relative", height: "0" }}>
                <div style={{ position: "absolute", top: "-9px", left: `calc(${targetMarker}% - 1px)`, width: "2px", height: "11px", background: "var(--text-secondary)", opacity: 0.55 }} title={`Target ${r.target}%`} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "13px", paddingTop: "11px", borderTop: "1px solid var(--border-subtle)", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {verdict}
      </div>
    </div>
  );
}

// ── Cash-flow Sankey ───────────────────────────────────────────────────────────
// The classic budget flow: one income source fanning out to every spending category
// plus savings, with ribbon thickness = dollars. Colored by 50/30/20 bucket.
const SANKEY_BUCKET_COLOR: Record<string, string> = {
  needs: "oklch(0.62 0.15 250)", wants: "oklch(0.66 0.16 300)", savings: "oklch(0.72 0.18 150)",
};
function CashFlowSankey({ income, leaves, isPrivate }: {
  income: number;
  leaves: { label: string; amount: number; bucket: "needs" | "wants" | "savings" }[];
  isPrivate: boolean;
}) {
  const ph = (v: string) => (isPrivate ? "••••" : v);
  const fmtMo = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const positive = leaves.filter((l) => l.amount > 0).sort((a, b) => (a.bucket === b.bucket ? b.amount - a.amount : a.bucket === "savings" ? 1 : b.bucket === "savings" ? -1 : 0));
  const total = positive.reduce((s, l) => s + l.amount, 0);
  if (total <= 0 || positive.length === 0) return null;

  const VB_W = 1000, padY = 8, rowGap = 6;
  const n = positive.length;
  const usableH = Math.max(200, n * 34);
  const VB_H = usableH + padY * 2;
  const sxRight = 230;            // income node right edge
  const txLeft = 660;            // leaf node left edge
  const nodeW = 16;
  const midx = (sxRight + txLeft) / 2;

  // Stack leaves on the right; income subdivided into matching bands on the left.
  let cursor = padY;
  let srcCursor = padY;
  const linkH = usableH - rowGap * (n - 1);
  const segs = positive.map((l) => {
    const h = (l.amount / total) * linkH;
    const ty0 = cursor, ty1 = cursor + h;
    const sy0 = srcCursor, sy1 = srcCursor + h;
    cursor += h + rowGap;
    srcCursor += h + rowGap;
    return { ...l, ty0, ty1, sy0, sy1, h };
  });
  const incTop = padY, incBot = segs[segs.length - 1].sy1;

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "10px", animationDelay: "70ms" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Where your money flows</span>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{ph(fmtMo(income))}/mo in</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: "block", overflow: "visible" }} preserveAspectRatio="xMidYMid meet">
        {/* Income node */}
        <rect x={sxRight - nodeW} y={incTop} width={nodeW} height={Math.max(1, incBot - incTop)} rx="3" fill="var(--text-secondary)" opacity="0.85" />
        <text x={sxRight - nodeW - 8} y={(incTop + incBot) / 2} textAnchor="end" dominantBaseline="middle" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px", fill: "var(--text-primary)" }}>Income</text>
        {/* Links + leaf nodes + labels */}
        {segs.map((s, i) => {
          const color = SANKEY_BUCKET_COLOR[s.bucket];
          const path = `M${sxRight},${s.sy0.toFixed(1)} C${midx},${s.sy0.toFixed(1)} ${midx},${s.ty0.toFixed(1)} ${txLeft},${s.ty0.toFixed(1)} L${txLeft},${s.ty1.toFixed(1)} C${midx},${s.ty1.toFixed(1)} ${midx},${s.sy1.toFixed(1)} ${sxRight},${s.sy1.toFixed(1)} Z`;
          return (
            <g key={i}>
              <path d={path} fill={color} opacity="0.26" />
              <rect x={txLeft} y={s.ty0} width={nodeW} height={Math.max(1, s.h)} rx="3" fill={color} />
              <text x={txLeft + nodeW + 8} y={(s.ty0 + s.ty1) / 2} dominantBaseline="middle" style={{ fontFamily: "var(--font-body)", fontSize: "12px", fill: "var(--text-secondary)" }}>
                {s.label}
                <tspan style={{ fontFamily: "var(--font-mono)", fill: "var(--text-tertiary)", fontSize: "11px" }}> · {ph(fmtMo(s.amount))} ({Math.round((s.amount / total) * 100)}%)</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "10px" }}>
        {([["needs", "Needs"], ["wants", "Wants"], ["savings", "Savings"]] as const).map(([k, label]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: SANKEY_BUCKET_COLOR[k] }} />{label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CashFlowOS({
  cashFlowItems, expenseActuals, budgetHistory, effectiveIncome, monthlyExpenses,
  monthlySavings, savingsRate, cashFlowFinnInsight, isPrivate, guided = false,
}: {
  cashFlowItems: CashFlowItem[]; expenseActuals: ExpenseActual[];
  budgetHistory: BudgetHistoryEntry[];
  effectiveIncome: number; monthlyExpenses: number; monthlySavings: number;
  savingsRate: number; cashFlowFinnInsight: string; isPrivate: boolean; guided?: boolean;
}) {
  const [cfExpanded, setCfExpanded] = useState(false);
  const cfAdvanced = !guided || cfExpanded;
  const router = useRouter();
  const now = new Date();
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [highlightedCat, setHighlightedCat] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<Set<string>>(new Set());
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<"monthly" | "annual" | "ytd">("monthly");
  const [showCal, setShowCal] = useState(false);

  const ytdMonths = selYear < now.getFullYear() ? 12 : now.getMonth() + 1;
  const mult = viewMode === "annual" ? 12 : viewMode === "ytd" ? ytdMonths : 1;
  const ph = (v: string) => isPrivate ? "••••" : v;
  const expenseItems = cashFlowItems.filter(i => i.type === "expense");
  const incomeItems  = cashFlowItems.filter(i => i.type === "income");
  const yearOptions  = [now.getFullYear(), now.getFullYear() - 1];

  function getActual(itemId: string) {
    return expenseActuals.find(
      a => a.cash_flow_item_id === itemId && a.period_year === selYear && a.period_month === selMonth
    );
  }
  function getHistory(itemId: string) {
    return expenseActuals
      .filter(a => a.cash_flow_item_id === itemId)
      .sort((a, b) => b.period_year !== a.period_year ? b.period_year - a.period_year : b.period_month - a.period_month)
      .slice(0, 6);
  }
  function forecastedMonthly(item: CashFlowItem) {
    return toMonthly(item.amount, item.frequency);
  }

  const isCurrentMonth = selYear === now.getFullYear() && selMonth === (now.getMonth() + 1);
  const daysInSelMonth = new Date(selYear, selMonth, 0).getDate();
  const pacingRatio = isCurrentMonth ? Math.max(0.01, now.getDate() / daysInSelMonth) : 1;

  const catData = useMemo(() => {
    return EXPENSE_CATEGORIES.map(cat => {
      const items = expenseItems.filter(i => categoryOf(i) === cat.label);
      const budgeted = items.reduce((s, i) => {
        const hist = getEffectiveBudget(budgetHistory, i.id, selYear, selMonth);
        return s + toMonthly(hist ?? i.amount, i.frequency);
      }, 0);
      const actualItems = expenseActuals.filter(a =>
        items.some(ei => ei.id === a.cash_flow_item_id) && a.period_year === selYear && a.period_month === selMonth
      );
      const actual = actualItems.reduce((s, a) => s + a.actual_amount, 0);
      return { ...cat, items, budgeted, actual };
    }).filter(c => c.budgeted > 0).sort((a, b) => b.budgeted - a.budgeted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashFlowItems, expenseActuals, budgetHistory, selYear, selMonth]);

  const totalBudgeted = catData.reduce((s, c) => s + c.budgeted, 0);

  // 50/30/20 buckets — monthly needs vs wants from the categorized budget
  const needsMonthly = catData.filter((c) => bucketForCategory(c.label) === "needs").reduce((s, c) => s + c.budgeted, 0);
  const wantsMonthly = catData.filter((c) => bucketForCategory(c.label) === "wants").reduce((s, c) => s + c.budgeted, 0);

  const donutSegments = useMemo(() => {
    let deg = 0;
    return catData.map(cat => {
      const pct = totalBudgeted > 0 ? cat.budgeted / totalBudgeted : 0;
      const start = deg;
      const end = deg + pct * 360;
      deg = end;
      return { ...cat, startDeg: start, endDeg: end };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catData, totalBudgeted]);

  const maxCatBudget = catData.length > 0 ? Math.max(...catData.map(c => c.budgeted)) : 1;

  const srColor = savingsRate >= 20 ? "oklch(0.72 0.19 145)"
    : savingsRate >= 10 ? "oklch(0.75 0.18 70)"
    : savingsRate > 0  ? "oklch(0.65 0.18 25)"
    : "var(--text-muted)";
  const srBarPct = Math.min(100, Math.max(0, (savingsRate / 30) * 100));

  const pacingAlerts = isCurrentMonth ? catData
    .filter(cat => cat.actual > 0 && cat.budgeted > 0)
    .map(cat => {
      const projected = cat.actual / pacingRatio;
      const overage = projected - cat.budgeted;
      return { label: cat.label, overage, pct: overage / cat.budgeted };
    })
    .filter(c => c.overage > 30 && c.pct > 0.08)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2) : [];

  const daysLeft = isCurrentMonth ? daysInSelMonth - now.getDate() : 0;

  async function handleSync(itemId: string) {
    setSyncingId(itemId);
    const result = await syncForecastToActuals(itemId);
    if (result.error) {
      setSyncMsg(m => ({ ...m, [itemId]: result.error! }));
    } else {
      setSyncMsg(m => ({ ...m, [itemId]: `Updated to ${fmt(result.newAmount ?? 0)}/mo` }));
    }
    setSyncingId(null);
  }

  const displayCenter = (totalBudgeted * mult) >= 1000
    ? `$${((totalBudgeted * mult) / 1000).toFixed(1)}k`
    : fmt(totalBudgeted * mult);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      <style>{`
        @keyframes cfo-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cfo-bar    { from { transform: scaleX(0); } }
        @keyframes cfo-sr     { from { width: 0; } }
        @keyframes cfo-arc    { from { opacity: 0; } to { opacity: 1; } }
        .cfo-zone  { animation: cfo-fadein 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .cfo-bar-a { animation: cfo-bar 0.85s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
        .cfo-sr-a  { animation: cfo-sr  1.1s cubic-bezier(0.22,1,0.36,1) both; }
        .cfo-arc-a { animation: cfo-arc 0.5s ease-out both; }
        .cfo-catrow:hover     { background: var(--surface-003) !important; }
        .cfo-catrow.cfo-hl   { background: var(--surface-004) !important; }
        .cfo-actual input:focus { border-color: var(--brand-blue) !important; outline: none; }
        @media (max-width: 640px) {
          /* Stack donut over bars; align-items:stretch so the bars span full
             width (inline alignItems:flex-start otherwise shrinks them). */
          .cfo-z2grid { flex-direction: column !important; align-items: stretch !important; }
          .cfo-donut  { width: 100% !important; display: flex; justify-content: center; }
          .cfo-z2grid > div:last-child { width: 100% !important; }
          .cfo-kpis   { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>

      {/* 50/30/20 balance */}
      <FiftyThirtyTwenty
        needsMonthly={needsMonthly}
        wantsMonthly={wantsMonthly}
        incomeMonthly={effectiveIncome}
        isPrivate={isPrivate}
      />

      {/* Zone 1 — Status Strip */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "18px 20px 16px", marginBottom: "10px",
        animationDelay: "0ms",
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <div style={{ display: "flex", background: "var(--surface-005)", borderRadius: "6px", padding: "2px", gap: "2px" }}>
            {(["monthly", "annual", "ytd"] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} style={{
                padding: "3px 10px", borderRadius: "4px", border: "none", cursor: "pointer",
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "capitalize",
                fontFamily: "var(--font-body)",
                background: viewMode === m ? "rgba(255,255,255,0.1)" : "transparent",
                color: viewMode === m ? "var(--text-primary)" : "var(--text-muted)",
                transition: "all 0.15s",
              }}>{m}</button>
            ))}
          </div>
        </div>
        <div className="cfo-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px 20px", marginBottom: "16px" }}>
          {([
            { label: viewMode === "annual" ? "Annual Income" : viewMode === "ytd" ? `${selYear} Income` : "Monthly Income",       val: ph(fmt(effectiveIncome * mult)),       color: "oklch(0.72 0.19 145)" },
            { label: viewMode === "annual" ? "Annual Expenses" : viewMode === "ytd" ? `${selYear} Expenses` : "Budgeted Expenses", val: ph(fmt(monthlyExpenses * mult)),       color: "oklch(0.65 0.18 25)"  },
            { label: viewMode === "annual" ? "Annual Savings" : viewMode === "ytd" ? `${selYear} Savings` : "Monthly Savings",     val: ph(fmt(Math.abs(monthlySavings * mult))), color: monthlySavings >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" },
            { label: "Savings Rate",                                                    val: effectiveIncome > 0 ? `${savingsRate.toFixed(1)}%` : "—",           color: srColor },
          ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "5px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>
        {effectiveIncome > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Savings Rate Progress</span>
              <span style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Target: 20%</span>
            </div>
            <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: `${(10/30)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
              <div style={{ position: "absolute", left: `${(20/30)*100}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.2)" }} />
              <div className="cfo-sr-a" style={{
                height: "100%", borderRadius: "3px",
                background: `linear-gradient(90deg, oklch(0.60 0.20 258), ${srColor})`,
                width: `${srBarPct}%`,
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Surplus routing callout */}
      {monthlySavings > 50 && viewMode === "monthly" && (
        <div className="cfo-zone" style={{
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "var(--radius-lg)", padding: "11px 16px", marginBottom: "10px",
          animationDelay: "30ms", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: "160px" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.72 0.19 145)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Surplus this month</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
              You&apos;re {ph(fmt(monthlySavings))} ahead — where should it go?
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { label: "Invest it",         href: "/portfolios" },
              { label: "Emergency fund",    href: "/planning?tab=balance" },
              { label: "Toward a goal",     href: "/planning?tab=events" },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{
                padding: "5px 12px", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.25)",
                background: "rgba(34,197,94,0.07)", color: "oklch(0.72 0.19 145)",
                fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)",
                textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap",
              }}>{label}</a>
            ))}
          </div>
        </div>
      )}

      {/* Atlas Insight Strip */}
      {(effectiveIncome > 0 || monthlyExpenses > 0) && (
        <div className="cfo-zone" style={{
          background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.22)",
          borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px",
          animationDelay: "60ms", display: "flex", gap: "11px", alignItems: "flex-start",
        }}>
          <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
              <path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/>
              <path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "3px" }}>Atlas</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>{cashFlowFinnInsight}</p>
          </div>
        </div>
      )}

      {/* Sankey — where the money flows (income → categories + savings) */}
      {effectiveIncome > 0 && catData.length > 0 && (
        <CashFlowSankey
          income={effectiveIncome}
          leaves={[
            ...catData.map((c) => ({ label: c.label, amount: c.budgeted, bucket: bucketForCategory(c.label) })),
            ...(monthlySavings > 0 ? [{ label: "Savings", amount: monthlySavings, bucket: "savings" as const }] : []),
          ]}
          isPrivate={isPrivate}
        />
      )}

      {/* Pacing Alert Strip — only for current month when tracking over budget */}
      {pacingAlerts.length > 0 && (
        <div className="cfo-zone" style={{
          background: "rgba(251,146,60,0.04)", border: "1px solid rgba(251,146,60,0.22)",
          borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px",
          animationDelay: "80ms", display: "flex", gap: "10px", alignItems: "flex-start",
        }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M10 3L18 17H2L10 3z" fill="rgba(251,146,60,0.15)" stroke="oklch(0.72 0.18 55)" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="10" y1="9" x2="10" y2="13" stroke="oklch(0.72 0.18 55)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="10" cy="15.5" r="0.8" fill="oklch(0.72 0.18 55)"/>
          </svg>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.72 0.18 55)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Pacing alert — {daysLeft} day{daysLeft !== 1 ? "s" : ""} left</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.6 }}>
              {pacingAlerts.map((a, i) => (
                <span key={a.label}>{i > 0 ? " " : ""}<strong style={{ color: "var(--text-primary)" }}>{a.label}</strong> is on track to exceed budget by {ph(fmt(a.overage))}.{i < pacingAlerts.length - 1 ? "" : ""}</span>
              ))}
            </p>
          </div>
        </div>
      )}

      {guided && !cfExpanded && (
        <button type="button" onClick={() => setCfExpanded(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "11px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer", marginBottom: "10px" }}>
          Show category detail & budget tracking
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {cfAdvanced && (<>
      {/* Zone 2 — Donut + Category Bars */}
      {catData.length > 0 && (
        <div className="cfo-zone" style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px",
          animationDelay: "110ms",
        }}>
          <div className="cfo-z2grid" style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>

            {/* Donut */}
            <div className="cfo-donut" style={{ flexShrink: 0, width: "196px" }}>
              <svg width="196" height="196" viewBox="0 0 196 196">
                <circle cx="98" cy="98" r="74" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
                {donutSegments.map((seg, si) => {
                  const isHl = highlightedCat === seg.label;
                  const color = CF_CAT_COLORS[seg.label] ?? "oklch(0.55 0.05 258)";
                  const d = cfArcPath(98, 98, 74, seg.startDeg, seg.endDeg);
                  if (!d) return null;
                  return (
                    <path
                      key={seg.label}
                      className="cfo-arc-a"
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={isHl ? 18 : 13}
                      strokeLinecap="round"
                      style={{
                        animationDelay: `${si * 35}ms`,
                        opacity: highlightedCat && !isHl ? 0.3 : 1,
                        transition: "opacity 0.2s, stroke-width 0.15s",
                        cursor: "pointer",
                        filter: isHl ? `drop-shadow(0 0 7px ${color})` : "none",
                      }}
                      onClick={() => setHighlightedCat(isHl ? null : seg.label)}
                    />
                  );
                })}
                {/* Center label */}
                <text x="98" y="90" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: "9px", fill: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {highlightedCat ?? "Expenses"}
                </text>
                <text x="98" y="111" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: "19px", fontWeight: 700, fill: highlightedCat ? (CF_CAT_COLORS[highlightedCat] ?? "var(--text-primary)") : "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {isPrivate ? "••••" : (highlightedCat
                    ? ((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult) >= 1000
                      ? `$${(((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult) / 1000).toFixed(1)}k`
                      : fmt((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult)
                    : displayCenter)}
                </text>
              </svg>
            </div>

            {/* Category bars */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "7px" }}>
                {viewMode === "annual" ? `${selYear} Annual Projection` : viewMode === "ytd" ? `${selYear} YTD (${ytdMonths}mo)` : `${MONTH_NAMES[selMonth - 1]} ${selYear}`} — Budget vs. Actual
              </div>
              {catData.map((cat, ci) => {
                const isHl = highlightedCat === cat.label;
                const color = CF_CAT_COLORS[cat.label] ?? "oklch(0.55 0.05 258)";
                const budgetW = maxCatBudget > 0 ? (cat.budgeted / maxCatBudget) * 100 : 0;
                const actualW = cat.actual > 0 && maxCatBudget > 0 ? (cat.actual / maxCatBudget) * 100 : 0;
                const variance = cat.actual > 0 ? cat.actual - cat.budgeted : null;
                return (
                  <div
                    key={cat.label}
                    className={`cfo-catrow${isHl ? " cfo-hl" : ""}`}
                    style={{
                      padding: "6px 8px", borderRadius: "6px",
                      border: `1px solid ${isHl ? color + "40" : "transparent"}`,
                      cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
                      opacity: highlightedCat && !isHl ? 0.5 : 1,
                    }}
                    onClick={() => setHighlightedCat(isHl ? null : cat.label)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
                      <span style={{ fontSize: "12px", lineHeight: 1, flexShrink: 0 }}>{cat.emoji}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontWeight: isHl ? 600 : 400, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: isHl ? color : "var(--text-secondary)" }}>{ph(fmt(cat.budgeted * mult))}</span>
                        {variance !== null && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: variance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)", background: variance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", padding: "1px 5px", borderRadius: "3px" }}>
                            {variance > 0 ? "+" : ""}{ph(fmt(variance * mult))}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ position: "relative", height: "5px", borderRadius: "2.5px", background: "var(--surface-006)" }}>
                      <div className="cfo-bar-a" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${budgetW}%`, borderRadius: "2.5px", background: color + "44", animationDelay: `${110 + ci * 45}ms` }} />
                      {cat.actual > 0 && (
                        <div className="cfo-bar-a" style={{ position: "absolute", top: "-1px", left: 0, height: "7px", width: `${Math.min(actualW, 105)}%`, borderRadius: "3.5px", background: color, animationDelay: `${190 + ci * 45}ms` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Build Budget from Statement — between Zone 2 and Zone 3 */}
      <div className="cfo-zone" style={{ animationDelay: "155ms" }}>
        <AiImportPanel
          existingItems={expenseItems}
          onAdd={async rows => {
            for (const row of rows) {
              const fd = new FormData();
              fd.set("label", row.label);
              fd.set("amount", String(row.amount));
              fd.set("frequency", "monthly");
              fd.set("type", "expense");
              if (row.category) fd.set("category", row.category);
              await addCashFlowItem(fd);
            }
          }}
        />
      </div>

      {/* Bill Calendar */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px",
        animationDelay: "170ms",
      }}>
        <button
          type="button"
          onClick={() => setShowCal(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="14" rx="2" stroke="var(--text-secondary)" strokeWidth="1.5"/>
            <line x1="6" y1="2" x2="6" y2="6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="14" y1="2" x2="14" y2="6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="18" y2="9" stroke="var(--text-secondary)" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1, textAlign: "left" }}>Bill Calendar — {MONTH_NAMES[selMonth - 1]} {selYear}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", transform: showCal ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </button>
        {showCal && (
          <div style={{ marginTop: "14px" }}>
            <BillCalendar cashFlowItems={cashFlowItems} year={selYear} month={selMonth} />
          </div>
        )}
      </div>

      {/* Zone 3 — Management */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "20px",
        animationDelay: "170ms",
      }}>
        {/* Period + statement import */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-body)" }}>Period</span>
          <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "11px" }}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "11px" }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={() => { setShowImport(p => !p); setImportSuccess(null); }}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "7px", border: "1px solid var(--card-border)", background: showImport ? "rgba(37,99,235,0.1)" : "var(--card-bg)", color: showImport ? "#93c5fd" : "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 500, cursor: "pointer", transition: "var(--transition-fast)" }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            Log from Statement
          </button>
        </div>

        {showImport && (
          <div style={{ marginBottom: "14px" }}>
            <StatementImportPanel expenseItems={expenseItems} selYear={selYear} selMonth={selMonth}
              onClose={() => setShowImport(false)}
              onDone={count => { setShowImport(false); setImportSuccess(count); router.refresh(); }}
            />
          </div>
        )}
        {importSuccess !== null && !showImport && (
          <div style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#22c55e", fontFamily: "var(--font-body)" }}>{importSuccess} actual{importSuccess !== 1 ? "s" : ""} logged for {MONTH_NAMES[selMonth - 1]} {selYear}.</span>
            <button type="button" onClick={() => setImportSuccess(null)} style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
        )}

        {/* Income */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={sectionHeadStyle}>Income <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px", color: "var(--text-muted)" }}>(net, after taxes)</span></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "oklch(0.72 0.19 145)", fontWeight: 600 }}>{ph(fmt(effectiveIncome))}/mo</span>
          </div>
          {incomeItems.map(item => (
            <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} isPrivate={isPrivate} />
          ))}
          <div style={{ marginTop: "8px" }}>
            <AddItemRow type="cashflow" placeholder="e.g. Salary" onAdd={fd => { fd.set("type", "income"); return addCashFlowItem(fd); }} />
          </div>
        </div>

        {/* Expenses with inline actuals */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={sectionHeadStyle}>Expenses</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "oklch(0.65 0.18 25)", fontWeight: 600 }}>{ph(fmt(monthlyExpenses))}/mo</span>
          </div>

          {expenseItems.length === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>
              No expenses yet. Add one below — Atlas auto-groups by category.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
              {EXPENSE_CATEGORIES.map(cat => {
                const items = expenseItems.filter(i => categoryOf(i) === cat.label);
                if (items.length === 0) return null;
                const catTotal = items.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
                const isExpanded = expandedCats.has(cat.label);
                const catColor = CF_CAT_COLORS[cat.label] ?? "oklch(0.55 0.05 258)";
                const isHl = highlightedCat === cat.label;
                const catActual = items.reduce((s, i) => { const a = getActual(i.id); return a ? s + a.actual_amount : s; }, 0);
                const loggedInCat = items.filter(i => !!getActual(i.id)).length;
                const catVariance = loggedInCat > 0 ? catActual - catTotal : null;

                return (
                  <div key={cat.label} style={{
                    border: `1px solid ${isHl ? catColor + "44" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)", overflow: "hidden", transition: "border-color 0.15s",
                  }}>
                    <button type="button"
                      onClick={() => setExpandedCats(prev => {
                        const next = new Set(prev);
                        next.has(cat.label) ? next.delete(cat.label) : next.add(cat.label);
                        return next;
                      })}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", background: isHl ? "rgba(255,255,255,0.022)" : "var(--bg-surface)", border: "none", cursor: "pointer", textAlign: "left", gap: "8px" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: catColor, flexShrink: 0, boxShadow: isHl ? `0 0 6px ${catColor}` : "none", transition: "box-shadow 0.2s" }} />
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cat.label}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>({items.length})</span>
                        {catVariance !== null && (
                          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "3px", background: catVariance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: catVariance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                            {catVariance > 0 ? "+" : ""}{ph(fmt(Math.abs(catVariance)))}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "oklch(0.65 0.18 25)" }}>{ph(fmt(catTotal))}/mo</span>
                        {loggedInCat > 0 && (
                          <span style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{loggedInCat}/{items.length}</span>
                        )}
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-tertiary)", flexShrink: 0 }}>
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{ background: "var(--card-bg)", padding: "0 13px 12px" }}>
                        {items.map(item => {
                          const actual = getActual(item.id);
                          const fcast = forecastedMonthly(item);
                          const variance = actual ? actual.actual_amount - fcast : null;
                          const history = getHistory(item.id);
                          const mKeyWhole = `${item.id}:whole`;

                          const rowLabel: React.CSSProperties = {
                            fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.09em", width: "44px", flexShrink: 0,
                            fontFamily: "var(--font-body)", paddingTop: "11px",
                          };

                          return (
                            <div key={item.id} style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "10px", marginBottom: "10px" }}>
                              {/* Budget row */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
                                <span style={{ ...rowLabel, color: "oklch(0.60 0.22 258)" }}>Budget</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <LineItemRow item={item} type="cashflow" onDelete={deleteCashFlowItem} isPrivate={isPrivate} editTitle="Edit budget amount" />
                                  {/* Category override — corrects the auto-classification */}
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
                                    <select
                                      value={item.category ?? "__auto__"}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        startTransition(async () => { await setCashFlowItemCategory(item.id, v); router.refresh(); });
                                      }}
                                      title={item.category ? "Category set manually" : `Auto-detected: ${categoryOf(item)}`}
                                      style={{
                                        fontSize: "10px", padding: "2px 6px", borderRadius: "5px",
                                        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                                        color: "var(--text-tertiary)", fontFamily: "var(--font-body)", cursor: "pointer", maxWidth: "160px",
                                      }}
                                    >
                                      <option value="__auto__">Auto: {getCategoryForExpense(item.label)}</option>
                                      {EXPENSE_CATEGORIES.map((c) => (
                                        <option key={c.label} value={c.label}>{c.emoji} {c.label}</option>
                                      ))}
                                    </select>
                                    {item.category && (
                                      <span style={{ fontSize: "8px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>manual</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {/* Actual row */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginTop: "2px" }}>
                                <span style={{ ...rowLabel, color: "oklch(0.68 0.18 163)", paddingTop: "6px" }}>Actual</span>
                                <div className="cfo-actual" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", paddingTop: "4px" }}>
                                <form
                                  action={fd => {
                                    fd.set("cash_flow_item_id", item.id);
                                    fd.set("label", item.label);
                                    fd.set("period_year", String(selYear));
                                    fd.set("period_month", String(selMonth));
                                    startTransition(async () => { await logExpenseActual(fd); router.refresh(); });
                                  }}
                                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                                >
                                  <input
                                    name="actual_amount" type="number" min="0" step="0.01"
                                    key={`${item.id}-${selYear}-${selMonth}`}
                                    defaultValue={actual?.actual_amount ?? ""}
                                    placeholder={isPrivate ? "••••" : "Actual $"}
                                    style={{ width: "88px", padding: "4px 7px", borderRadius: "6px", fontSize: "11px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", transition: "border-color 0.15s" }}
                                  />
                                  <button type="submit" disabled={pending}
                                    style={{ padding: "4px 9px", borderRadius: "6px", fontSize: "10px", fontWeight: 600, background: "var(--brand-blue)", color: "#fff", border: "none", cursor: "pointer" }}>
                                    Log
                                  </button>
                                </form>
                                {variance !== null && (
                                  <span style={{ padding: "2px 7px", borderRadius: "3px", fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-mono)", background: variance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: variance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                                    {variance > 0 ? "+" : ""}{ph(fmt(variance))} {variance > 0 ? "over" : "under"}
                                  </span>
                                )}
                                {history.length >= 3 && (
                                  <button onClick={() => handleSync(item.id)} disabled={syncingId === item.id} title="Update forecast to 3-month avg"
                                    style={{ padding: "2px 7px", borderRadius: "5px", fontSize: "9px", fontWeight: 500, background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer" }}>
                                    {syncingId === item.id ? "Syncing…" : "Sync"}
                                  </button>
                                )}
                              </div>
                              {syncMsg[item.id] && <div style={{ marginTop: "3px", fontSize: "10px", color: syncMsg[item.id].startsWith("Updated") ? "var(--green)" : "var(--red)" }}>{syncMsg[item.id]}</div>}
                              {/* Sparkline history */}
                              {history.length > 1 && (
                                <div style={{ marginTop: "6px", display: "flex", gap: "3px", alignItems: "flex-end" }}>
                                  {history.slice().reverse().map((h, hi) => {
                                    const barH = Math.max(3, Math.min(22, (h.actual_amount / (fcast * 2 || 1)) * 18));
                                    return (
                                      <div key={hi} title={`${MONTH_NAMES[h.period_month - 1]} ${h.period_year}: $${h.actual_amount.toLocaleString()}`}
                                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                        <div style={{ width: "13px", height: `${barH}px`, borderRadius: "2px", background: h.actual_amount > fcast ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.45)" }} />
                                        <span style={{ fontSize: "8px", color: "var(--text-muted)" }}>{MONTH_NAMES[h.period_month - 1][0]}</span>
                                      </div>
                                    );
                                  })}
                                  <div style={{ width: "1px", background: "var(--border-subtle)", height: "16px", margin: "0 1px" }} />
                                  <div style={{ width: "13px", height: "14px", borderRadius: "2px", background: "rgba(99,102,241,0.25)", position: "relative" }} title={`Forecast: ${fmt(fcast)}`}>
                                    <span style={{ position: "absolute", bottom: "-11px", fontSize: "8px", color: "var(--text-muted)" }}>F</span>
                                  </div>
                                </div>
                              )}
                              {/* Move whole actual */}
                              {actual && (!actual.breakdown || actual.breakdown.length === 0) && expenseItems.filter(ei => ei.id !== item.id).length > 0 && (() => {
                                const isMoving = movingKey === mKeyWhole;
                                const others = expenseItems.filter(ei => ei.id !== item.id);
                                return (
                                  <div style={{ marginTop: "5px" }}>
                                    <button type="button" onClick={() => setMovingKey(isMoving ? null : mKeyWhole)}
                                      style={{ background: isMoving ? "var(--bg-elevated)" : "none", border: isMoving ? "1px solid var(--border-subtle)" : "1px solid transparent", borderRadius: "4px", cursor: "pointer", color: isMoving ? "var(--accent)" : "var(--text-tertiary)", fontSize: "9px", padding: "2px 6px", lineHeight: 1, fontFamily: "var(--font-body)" }}>
                                      → Move ${actual.actual_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </button>
                                    {isMoving && (
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                        <span style={{ fontSize: "9px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>Move to:</span>
                                        <select defaultValue="" onChange={e => {
                                          const destId = e.target.value;
                                          if (!destId) return;
                                          setMovingKey(null);
                                          startTransition(async () => { await moveMerchantActual(item.id, destId, item.label, actual.actual_amount, selYear, selMonth); router.refresh(); });
                                        }} style={{ flex: 1, padding: "3px 5px", borderRadius: "5px", fontSize: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", cursor: "pointer" }}>
                                          <option value="" disabled>Select bucket...</option>
                                          {others.map(ei => <option key={ei.id} value={ei.id}>{ei.label}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setMovingKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}>×</button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Breakdown */}
                              {actual?.breakdown && actual.breakdown.length > 0 && (
                                <>
                                  <button type="button" onClick={() => setExpandedBreakdown(prev => {
                                    const next = new Set(prev);
                                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                    return next;
                                  })} style={{ marginTop: "5px", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "10px", padding: "0", display: "flex", alignItems: "center", gap: "4px" }}>
                                    {expandedBreakdown.has(item.id) ? "▲" : "▼"} {actual.breakdown.length} merchant{actual.breakdown.length !== 1 ? "s" : ""}
                                  </button>
                                  {expandedBreakdown.has(item.id) && (
                                    <div style={{ marginTop: "4px", paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
                                      {actual.breakdown.map((m, mi) => {
                                        const mKeyBreak = `${item.id}:${mi}`;
                                        const isMov = movingKey === mKeyBreak;
                                        const others = expenseItems.filter(ei => ei.id !== item.id);
                                        return (
                                          <div key={mi} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                                              <span style={{ fontSize: "10px", color: "var(--text-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {m.label}</span>
                                              <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                                                <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                {others.length > 0 && (
                                                  <button type="button" onClick={() => setMovingKey(isMov ? null : mKeyBreak)} style={{ background: isMov ? "var(--bg-elevated)" : "none", border: isMov ? "1px solid var(--border-subtle)" : "none", borderRadius: "3px", cursor: "pointer", color: isMov ? "var(--accent)" : "var(--text-tertiary)", fontSize: "10px", padding: "1px 4px", lineHeight: 1 }}>→</button>
                                                )}
                                              </div>
                                            </div>
                                            {isMov && (
                                              <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "10px" }}>
                                                <span style={{ fontSize: "9px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>Move to:</span>
                                                <select defaultValue="" onChange={e => {
                                                  const destId = e.target.value;
                                                  if (!destId) return;
                                                  setMovingKey(null);
                                                  startTransition(async () => { await moveMerchantActual(item.id, destId, m.label, m.amount, selYear, selMonth); router.refresh(); });
                                                }} style={{ flex: 1, padding: "3px 5px", borderRadius: "5px", fontSize: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", cursor: "pointer" }}>
                                                  <option value="" disabled>Select bucket...</option>
                                                  {others.map(ei => <option key={ei.id} value={ei.id}>{ei.label}</option>)}
                                                </select>
                                                <button type="button" onClick={() => setMovingKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}>×</button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                              </div>{/* end Actual row wrapper */}
                            </div>
                          );
                        })}
                        <div style={{ marginTop: "6px" }}>
                          <AddItemRow type="cashflow" placeholder={`Add ${cat.label.toLowerCase()} expense`} onAdd={fd => { fd.set("type", "expense"); fd.set("category", cat.label); return addCashFlowItem(fd); }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <AddItemRow type="cashflow" placeholder="Add expense (auto-categorized by label)" onAdd={fd => { fd.set("type", "expense"); return addCashFlowItem(fd); }} />
        </div>
      </div>
      {guided && cfExpanded && (
        <button type="button" onClick={() => setCfExpanded(false)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "9px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "transparent", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
          Show less
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      </>)}
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
  portfolioAccounts?: PortfolioAccount[];
  assumptions: PlanningAssumptions | null;
  futureEvents: FutureEvent[];
  homeScenarios: HomeScenario[];
  careerScenarios: CareerScenario[];
  educationScenarios: EducationScenario[];
  familyScenarios: FamilyScenario[];
  sabbaticalScenarios: SabbaticalScenario[];
  carScenarios: CarScenario[];
  apartmentListings: ApartmentListing[];
  expenseActuals: ExpenseActual[];
  budgetHistory: BudgetHistoryEntry[];
  estateProfile: EstateProfile | null;
  initialTab?: string;
};

type Tab = "overview" | "balance" | "cashflow" | "forecast" | "events" | "estate" | "finn";
type FinnChatEntry = { role: "user" | "finn"; text: string };

// Contextual "thinking" states for the Ask Atlas chat — premium, calm, analytical
// (not a generic spinner). Cycles while Atlas is composing a reply.
const ATLAS_THINKING = [
  "Reading your balance sheet…",
  "Reviewing your forecast…",
  "Checking your savings rate…",
  "Weighing your retirement timeline…",
  "Scanning your tax buckets…",
  "Pressure-testing your plan…",
];

export default function PlanningClient({
  profile, balanceItems, cashFlowItems, netWorthHistory, portfolioTotalValue, portfolioAccounts = [],
  assumptions, futureEvents, homeScenarios, careerScenarios, educationScenarios, familyScenarios,
  sabbaticalScenarios, carScenarios, apartmentListings, expenseActuals, budgetHistory, estateProfile, initialTab,
}: Props) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? "overview");
  const [isPrivate, setIsPrivateRaw] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("bt-privacy-mode") === "true") setIsPrivateRaw(true); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function togglePrivacy() {
    setIsPrivateRaw((v) => {
      const next = !v;
      try { localStorage.setItem("bt-privacy-mode", String(next)); } catch {}
      return next;
    });
  }
  function pHide(value: string): string { return isPrivate ? "••••••" : value; }

  // Density mode — "guided" (calm, big-picture, depth on demand) vs "pro" (everything open).
  // New users start guided so the hub isn't overwhelming; the choice is remembered.
  const [density, setDensityRaw] = useState<"guided" | "pro">("guided");
  useEffect(() => {
    try { const d = localStorage.getItem("bt-planning-density"); if (d === "pro" || d === "guided") setDensityRaw(d); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function setDensity(d: "guided" | "pro") {
    setDensityRaw(d);
    try { localStorage.setItem("bt-planning-density", d); } catch {}
  }
  const guided = density === "guided";
  const hasPlanProfile = profile?.current_age != null;
  // Guided collapses the dense lower half of Overview behind one expander (only when a
  // profile exists — new users still see the full setup path).
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const overviewAdvanced = !guided || !hasPlanProfile || overviewExpanded;
  // Guided shows a curated subset of the 18 planners (the universal ones); the rest are
  // hidden via CSS behind "Show all" so the hub isn't an 18-card wall on first look.
  const [hubExpanded, setHubExpanded] = useState(false);
  // Guided Forecast keeps the readiness + chart + drawdown, collapses the deep analytics
  // (biggest drivers, year-by-year table, scenario A/B) behind one expander.
  const [forecastExpanded, setForecastExpanded] = useState(false);
  const forecastAdvanced = !guided || forecastExpanded;

  const [profilePending, startProfileTransition] = useTransition();
  const [editingProfile, setEditingProfile] = useState(!profile);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileKids, setProfileKids] = useState<ProfileKid[]>(() => profile?.kids_json ?? []);
  // Live tax form state — drives the reactive preview while editing
  const [formGross, setFormGross] = useState(() => profile?.gross_monthly_income ?? 0);
  const [formFilingStatus, setFormFilingStatus] = useState<FilingStatus>(() => (profile?.filing_status as FilingStatus) ?? "single");
  const [formIncomeType, setFormIncomeType] = useState<IncomeType>(() => (profile?.income_type as IncomeType) ?? "w2");
  const [formStateCode, setFormStateCode] = useState(() => profile?.state_code ?? "");
  const [formPreTax, setFormPreTax] = useState(() => profile?.pre_tax_deductions_annual ?? 0);
  const [netOverride, setNetOverride] = useState<number | null>(() => profile?.net_monthly_override ?? null);
  const [showNetOverride, setShowNetOverride] = useState(() => (profile?.net_monthly_override ?? null) !== null);

  // Reset all tax-form state when the user opens the edit panel, so canceling and re-opening shows saved values
  useEffect(() => {
    if (editingProfile) {
      setFormGross(profile?.gross_monthly_income ?? 0);
      setFormFilingStatus((profile?.filing_status as FilingStatus) ?? "single");
      setFormIncomeType((profile?.income_type as IncomeType) ?? "w2");
      setFormStateCode(profile?.state_code ?? "");
      setFormPreTax(profile?.pre_tax_deductions_annual ?? 0);
      setNetOverride(profile?.net_monthly_override ?? null);
      setShowNetOverride((profile?.net_monthly_override ?? null) !== null);
      setProfileSaveError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProfile]);

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
    social_security_monthly: assumptions?.social_security_monthly ?? 0,
    social_security_claim_age: assumptions?.social_security_claim_age ?? 67,
  });
  // Annual guaranteed retirement income in today's dollars — netted against
  // expenses in the readiness math (the 25x rule applies to the gap, not gross spend).
  const annualRetirementIncome = Math.max(0, (localAssumptions.social_security_monthly || 0) * 12);
  const [assumptionsPending, startAssumptionsTransition] = useTransition();

  // Future events
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventPending, startEventTransition] = useTransition();
  const eventFormRef = useRef<HTMLFormElement>(null);

  // Atlas chat
  const [finnChatMessages, setFinnChatMessages] = useState<FinnChatEntry[]>([]);
  const [finnChatInput, setFinnChatInput] = useState("");
  const [finnChatLoading, setFinnChatLoading] = useState(false);
  const [finnChatAnimatingIdx, setFinnChatAnimatingIdx] = useState<number | null>(null);
  const [finnChatAnimatedText, setFinnChatAnimatedText] = useState("");
  const finnChatInitialized = useRef(false);
  const finnChatScrollRef = useRef<HTMLDivElement>(null);
  const finnChatAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Cycling "thinking" state while Atlas composes a reply.
  const [atlasThinkingIdx, setAtlasThinkingIdx] = useState(0);
  const atlasThinkingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (finnChatLoading) {
      setAtlasThinkingIdx(0);
      atlasThinkingRef.current = setInterval(() => setAtlasThinkingIdx((p) => (p + 1) % ATLAS_THINKING.length), 1600);
    } else if (atlasThinkingRef.current) {
      clearInterval(atlasThinkingRef.current); atlasThinkingRef.current = null;
    }
    return () => { if (atlasThinkingRef.current) clearInterval(atlasThinkingRef.current); };
  }, [finnChatLoading]);

  // Forecast scenarios
  const [scenarioRetirementAge, setScenarioRetirementAge] = useState<number | null>(
    profile?.target_retirement_age ?? null
  );
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [whatIfScenario, setWhatIfScenario] = useState<"home" | "child" | "career" | null>(null);
  // Drawdown options (Forecast tab → Retirement Drawdown card)
  const [modelRothConversions, setModelRothConversions] = useState(false);
  const [conversionBracket, setConversionBracket] = useState<"12" | "22">("12"); // bracket to fill with conversions
  const [healthcareAnnual, setHealthcareAnnual] = useState(0);  // today's $/yr, on top of base expenses
  const [modelLtc, setModelLtc] = useState(false);              // preset: $100k/yr × 3yrs at age 83
  const [drawdownMcOn, setDrawdownMcOn] = useState(false);      // run Monte Carlo on the drawdown

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

  // 401(k): the Traditional employee contribution is a pre-tax deduction, so it lowers
  // taxable income / take-home automatically. The employer match + traditional employee
  // contribution both flow into the tax-deferred bucket the drawdown engine grows.
  const k401Result = (profile?.has_401k && (profile?.gross_monthly_income ?? 0) > 0)
    ? compute401k({
        grossAnnualIncome: (profile!.gross_monthly_income ?? 0) * 12,
        contributionPct: profile!.k401_contribution_pct ?? 0,
        isRoth: profile!.k401_is_roth ?? false,
        employerMatchPct: profile!.k401_employer_match_pct ?? 0,
        employerMatchLimitPct: profile!.k401_employer_match_limit_pct ?? 0,
        age: profile!.current_age,
      })
    : null;
  const k401TraditionalAnnual = k401Result?.traditionalAnnual ?? 0;
  const k401DeferredAnnual = (k401Result?.traditionalAnnual ?? 0) + (k401Result?.employerAnnual ?? 0);
  const k401EmployeeMonthly = (k401Result?.employeeAnnual ?? 0) / 12;
  const effectivePreTaxAnnual = (profile?.pre_tax_deductions_annual ?? 0) + k401TraditionalAnnual;

  // Derive estimated net income from gross profile income using tax estimator.
  // Net take-home = after-tax pay MINUS the employee 401(k) deferral that leaves the paycheck
  // (the override branch is the user's stated net, so it already reflects their deductions).
  const profileGross = profile?.gross_monthly_income ?? 0;
  const profileNetMonthly = (profile?.net_monthly_override !== null && profile?.net_monthly_override !== undefined)
    ? profile.net_monthly_override
    : profileGross > 0
      ? estimateTax(
          profileGross,
          (profile?.filing_status as FilingStatus) ?? "single",
          (profile?.income_type as IncomeType) ?? "w2",
          profile?.state_code ?? "",
          effectivePreTaxAnnual,
        ).netMonthly - k401EmployeeMonthly
      : 0;
  // Use profile overrides if cash flow items are empty
  const effectiveIncome = monthlyIncome > 0 ? monthlyIncome : profileNetMonthly;
  const effectiveExpenses = monthlyExpenses > 0 ? monthlyExpenses : (profile?.monthly_expenses ?? 0);
  const monthlySavings = effectiveIncome - effectiveExpenses;
  const savingsRate = effectiveIncome > 0 ? (monthlySavings / effectiveIncome) * 100 : 0;

  const liquidAssets = assets
    .filter((i) => i.category === "cash")
    .reduce((s, i) => s + i.value, 0);

  const yearsToRetire = (profile?.current_age != null && profile?.target_retirement_age != null)
    ? Math.max(0, profile.target_retirement_age - profile.current_age)
    : null;

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

  // ── Atlas commentary ────────────────────────────────────────────────────────

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
        tax_taxable: taxBucketsNow.taxable,
        tax_deferred: taxBucketsNow.tax_deferred,
        tax_free: taxBucketsNow.tax_free,
        drawdown_lasts_to_age: drawdown?.lastsToAge ?? null,
        drawdown_end_age: drawdown?.endAge ?? null,
        drawdown_lifetime_taxes: drawdown?.totalTaxes ?? null,
        roth_conversion_tax_savings: (drawdown && drawdownAlt)
          ? (modelRothConversions ? drawdownAlt.totalTaxes - drawdown.totalTaxes : drawdown.totalTaxes - drawdownAlt.totalTaxes)
          : null,
      };
      const res = await fetch("/api/planning/finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = res.status === 429
          ? "Atlas is temporarily rate-limited. Try again in a moment."
          : "Atlas is temporarily unavailable. Please try again.";
        setFinnCommentary(msg);
        return;
      }
      setFinnCommentary(data.commentary ?? null);
    } catch {
      setFinnCommentary("Unable to load Atlas commentary at this time.");
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

  // Plan spine: every committed life decision feeds the one master forecast.
  const planLifeEvents = useMemo(() => collectLifeEvents({
    futureEvents, familyScenarios, educationScenarios, currentYear, horizonYears: forecastYears,
  }), [futureEvents, familyScenarios, educationScenarios, currentYear, forecastYears]);

  const forecastBands = buildForecastBands(
    netWorth, effectiveIncome, effectiveExpenses,
    forecastYears,
    localAssumptions.return_rate / 100,
    localAssumptions.inflation_rate / 100,
    localAssumptions.salary_growth_rate / 100,
    planLifeEvents, currentYear,
  );

  const retirementPoint = activeYearsToRetire != null
    ? forecastBands[Math.min(activeYearsToRetire, forecastBands.length - 1)]
    : forecastBands[forecastBands.length - 1];
  // SS is entered in today's dollars; inflate it to retirement-year dollars (COLA tracks
  // inflation) so it nets cleanly against the inflated expenses in retirementPoint.
  const annualRetirementIncomeAtRetire = annualRetirementIncome > 0
    ? annualRetirementIncome * Math.pow(1 + localAssumptions.inflation_rate / 100, activeYearsToRetire ?? 0)
    : 0;
  const retirementProb = retirementPoint
    ? calcRetirementProbability(retirementPoint.baseline, retirementPoint.annualExpenses, annualRetirementIncomeAtRetire)
    : null;

  // After-tax retirement assets — a tax-deferred dollar is worth less than a Roth/taxable
  // dollar because withdrawals are taxed as income. We discount the tax-deferred share of
  // the projected portfolio by an assumed effective retirement tax rate. Additive readout;
  // does NOT alter the headline probability. Approximation: holds today's bucket mix forward.
  const EFFECTIVE_RETIREMENT_TAX_RATE = 0.18;
  const taxBucketsNow = useMemo(
    () => computeTaxBuckets(assets, portfolioAccounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, portfolioTotalValue, portfolioAccounts],
  );
  const taxDeferredFraction = taxBucketsNow.total > 0 ? taxBucketsNow.tax_deferred / taxBucketsNow.total : 0;
  const afterTaxRetirementAssets = retirementPoint && taxDeferredFraction > 0
    ? Math.round(retirementPoint.baseline * (1 - taxDeferredFraction * EFFECTIVE_RETIREMENT_TAX_RATE))
    : null;
  const retirementTaxDrag = retirementPoint && afterTaxRetirementAssets != null
    ? Math.round(retirementPoint.baseline - afterTaxRetirementAssets)
    : null;

  // ── Retirement drawdown simulation (the spending phase) ────────────────────
  // Projects the INVESTABLE portfolio (not net worth — excludes home/illiquid) to
  // the retirement year, then draws it down tax-smart with RMDs + Social Security,
  // real federal brackets, optional Roth conversions, and healthcare/LTC costs.
  // Supports "already retired" (current age ≥ retirement age → drawdown starts now).
  const DRAWDOWN_END_AGE = 95;
  const drawdownParams = useMemo<DrawdownParams | null>(() => {
    const cAge = profile?.current_age ?? null;
    const rAge = activeRetirementAge ?? null;
    if (cAge == null || rAge == null) return null;
    const investNow = taxBucketsNow.total;
    if (investNow <= 0 || !retirementPoint || retirementPoint.annualExpenses <= 0) return null;

    const r = localAssumptions.return_rate / 100;
    const inflation = localAssumptions.inflation_rate / 100;
    const yearsToRet = Math.max(0, rAge - cAge);

    // Per-bucket accumulation to retirement. After-tax savings flow into the taxable
    // bucket (as basis); pre-tax deductions (401k/IRA/HSA) flow into tax-deferred — this
    // captures contributions the old "hold today's mix forward" model ignored, and lets
    // the retirement mix differ from today's. Already-retired starts from today's balances.
    const afterTaxSavings = Math.max(0, monthlySavings * 12);
    // Annual pre-tax contributions to the tax-deferred bucket = manual pre-tax deductions
    // + the 401(k) (Traditional employee deferral + employer match).
    const preTaxAnnual = Math.max(0, (profile?.pre_tax_deductions_annual ?? 0) + k401DeferredAnnual);
    let bTaxable = Math.max(0, taxBucketsNow.taxable);
    let bDeferred = Math.max(0, taxBucketsNow.tax_deferred);
    let bFree = Math.max(0, taxBucketsNow.tax_free);
    let basisTaxable = bTaxable * 0.7; // assume ~30% embedded gains in today's taxable holdings
    // If the user already holds Roth money, assume they keep funding a Roth IRA each year
    // (2025 limit $7k, +$1k catch-up at 50+); the rest of after-tax savings goes to taxable.
    const rothContribAnnual = bFree > 0 ? Math.min(afterTaxSavings, iraLimitForAge(cAge)) : 0;
    const taxableContribAnnual = Math.max(0, afterTaxSavings - rothContribAnnual);
    for (let y = 0; y < yearsToRet; y++) {
      bDeferred = bDeferred * (1 + r) + preTaxAnnual;
      bFree = bFree * (1 + r) + rothContribAnnual;
      bTaxable = bTaxable * (1 + r) + taxableContribAnnual;
      basisTaxable += taxableContribAnnual; // contributions add to basis (only growth is gains)
    }
    const filing = (profile?.filing_status as FilingStatus) || "single";
    const conversionTop = (conversionBracket === "22" ? TWENTY_TWO_PCT_BRACKET_TOP : TWELVE_PCT_BRACKET_TOP)[filing];

    return {
      startTaxable: bTaxable,
      startTaxDeferred: bDeferred,
      startTaxFree: bFree,
      startTaxableBasis: basisTaxable,
      currentAge: cAge,
      retirementAge: rAge,
      endAge: DRAWDOWN_END_AGE,
      annualExpensesAtRetirement: retirementPoint.annualExpenses,
      inflationRate: inflation,
      returnRate: r,
      socialSecurityAnnualToday: annualRetirementIncome,
      claimAge: localAssumptions.social_security_claim_age || 67,
      filing,
      stateCode: profile?.state_code || undefined,
      rothConversions: modelRothConversions,
      conversionFillToTaxable: conversionTop,
      annualHealthcareToday: Math.max(0, healthcareAnnual),
      ltcAnnualToday: modelLtc ? 100_000 : 0,
      ltcStartAge: 83,
      ltcYears: 3,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.current_age, profile?.filing_status, profile?.state_code, profile?.pre_tax_deductions_annual,
      k401DeferredAnnual,
      activeRetirementAge, taxBucketsNow, retirementPoint?.annualExpenses,
      localAssumptions.return_rate, localAssumptions.inflation_rate, localAssumptions.social_security_claim_age,
      monthlySavings, annualRetirementIncome, modelRothConversions, conversionBracket, healthcareAnnual, modelLtc]);

  const drawdown = useMemo<DrawdownResult | null>(
    () => (drawdownParams ? simulateRetirementDrawdown(drawdownParams) : null), [drawdownParams]);
  // Counterfactual with the Roth-conversion choice flipped — powers the "with vs without" comparison.
  const drawdownAlt = useMemo<DrawdownResult | null>(
    () => (drawdownParams ? simulateRetirementDrawdown({ ...drawdownParams, rothConversions: !drawdownParams.rothConversions }) : null), [drawdownParams]);
  const drawdownMc = useMemo(
    () => (drawdownParams && drawdownMcOn ? runDrawdownMonteCarlo(drawdownParams) : null), [drawdownParams, drawdownMcOn]);

  // ── Master Life Roadmap data (P-Spine-2) ──────────────────────────────────
  const roadmap = useMemo(() => {
    const startYear = currentYear;
    const endYear = currentYear + forecastYears;
    const hrefByCat: Record<string, string> = {
      home_purchase: "/planning/home", home_sale: "/planning/home", home: "/planning/home",
      family: "/planning/family", education: "/planning/education", vehicle: "/planning/car",
      wedding: "/planning/wedding", windfall: "/planning/windfall",
    };
    const events: RoadmapEvent[] = [];
    for (const e of futureEvents) {
      if (e.event_year < startYear || e.event_year > endYear) continue;
      events.push({ id: e.id, year: e.event_year, label: e.label, amount: e.amount_impact, category: e.category ?? "other", href: hrefByCat[e.category ?? ""] });
    }
    // Family / education are auto-fed to the forecast; surface one marker each.
    for (const s of familyScenarios) {
      const monthly = s.child_current_age < 3 ? Number(s.monthly_infant_cost) : s.child_current_age <= 12 ? Number(s.monthly_child_cost) : Number(s.monthly_teen_cost);
      events.push({ id: `fam-${s.id}`, year: startYear, label: `${s.child_name ?? "Child"}`, amount: -(monthly * 12), category: "family", href: "/planning/family" });
    }
    for (const s of educationScenarios) {
      const yr = startYear + Math.max(0, 18 - s.child_current_age);
      if (yr > endYear) continue;
      const inflated = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yr - startYear);
      events.push({ id: `edu-${s.id}`, year: yr, label: `${s.child_name ?? "College"} starts`, amount: -Math.round(inflated), category: "education", href: "/planning/education" });
    }

    const milestones: RoadmapMilestone[] = [];
    if (activeYearsToRetire != null) milestones.push({ year: startYear + activeYearsToRetire, label: "Retire", kind: "retirement" });
    const thresholds: [number, string][] = [[100_000, "$100k"], [250_000, "$250k"], [500_000, "$500k"], [1_000_000, "$1M"], [2_000_000, "$2M"], [5_000_000, "$5M"]];
    for (const [amt, label] of thresholds) {
      if (netWorth >= amt) continue; // already there
      const hit = forecastBands.find((p) => p.baseline >= amt);
      if (hit) milestones.push({ year: startYear + hit.year, label, kind: "wealth" });
    }

    const trajectory: TrajectoryPoint[] = forecastBands.map((p) => ({ year: startYear + p.year, nw: p.baseline }));
    return { startYear, endYear, events, milestones, trajectory };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [futureEvents, familyScenarios, educationScenarios, forecastBands, currentYear, forecastYears, activeYearsToRetire, netWorth]);

  const estateDocsComplete = estateProfile
    ? [estateProfile.doc_will, estateProfile.doc_living_trust, estateProfile.doc_durable_poa, estateProfile.doc_healthcare_directive, estateProfile.doc_beneficiary_desig, estateProfile.doc_digital_assets].filter((d) => d !== "none" && d != null).length
    : 0;

  const healthData = calcHealthScore(
    savingsRate, effectiveExpenses, liquidAssets,
    totalAssets, totalLiabilities,
    profile?.current_age ?? null, profile?.target_retirement_age ?? null,
    monthlySavings,
    estateDocsComplete, effectiveIncome, retirementProb,
  );

  const whatIfImpacts = useMemo(() => {
    if (retirementPoint == null || forecastYears <= 0) return null;
    const base = retirementPoint.baseline;
    const retYear = Math.min(activeYearsToRetire ?? forecastYears, forecastYears);
    const opts = [localAssumptions.return_rate / 100, localAssumptions.inflation_rate / 100, localAssumptions.salary_growth_rate / 100] as const;

    const homeExtraMo = homeScenarios.length > 0
      ? (() => {
          const s = homeScenarios[0];
          const loan = s.purchase_price - s.down_payment;
          const r = s.mortgage_rate / 12;
          const n = s.loan_term_years * 12;
          const pmt = loan > 0 && r > 0 ? loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : 0;
          return Math.max(0, pmt + s.property_tax_monthly + s.insurance_monthly + s.hoa_monthly - s.monthly_rent);
        })()
      : Math.round(effectiveIncome * 0.28);
    const dpOutflow = homeScenarios.length > 0 ? homeScenarios[0].down_payment : Math.round(effectiveIncome * 12 * 0.1);
    const homeEvents: FutureEvent[] = [
      ...futureEvents,
      { id: "__wi_dp", user_id: "", label: "Home down payment", event_year: currentYear + 3, amount_impact: -dpOutflow, category: "what_if", sort_order: 999 },
    ];
    const homeBands = buildForecastBands(netWorth, effectiveIncome, effectiveExpenses + homeExtraMo, forecastYears, ...opts, homeEvents, currentYear);
    const homeAtRetire = homeBands[Math.min(retYear, homeBands.length - 1)];
    const childBands = buildForecastBands(netWorth, effectiveIncome, effectiveExpenses + 1200, forecastYears, ...opts, futureEvents, currentYear);
    const childAtRetire = childBands[Math.min(retYear, childBands.length - 1)];
    const careerBands = buildForecastBands(netWorth, Math.round(effectiveIncome * 1.2), effectiveExpenses, forecastYears, ...opts, futureEvents, currentYear);
    const careerAtRetire = careerBands[Math.min(retYear, careerBands.length - 1)];

    return {
      home:   { impact: homeAtRetire  ? homeAtRetire.baseline  - base : null, bands: homeBands,   extraMo: homeExtraMo, dpOutflow },
      child:  { impact: childAtRetire ? childAtRetire.baseline - base : null, bands: childBands  },
      career: { impact: careerAtRetire ? careerAtRetire.baseline - base : null, bands: careerBands },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retirementPoint?.baseline, forecastYears, activeYearsToRetire, netWorth, effectiveIncome, effectiveExpenses,
      localAssumptions.return_rate, localAssumptions.inflation_rate, localAssumptions.salary_growth_rate,
      homeScenarios, futureEvents, currentYear]);

  // ── Life Plan hub computation ──────────────────────────────────────────────
  const lifePlan = useMemo(() => {
    // Planner health
    const plannerHealth: Record<string, "strong" | "review" | "alert" | "not-started"> = {
      home: homeScenarios.length === 0 ? "not-started" : (() => {
        const anyReasonable = homeScenarios.some((s) => {
          const loan = s.purchase_price - s.down_payment;
          const r = s.mortgage_rate / 12;
          const n = s.loan_term_years * 12;
          const pmt = loan > 0 && r > 0 ? loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / (n || 1);
          const total = pmt + s.property_tax_monthly + s.insurance_monthly + s.hoa_monthly + (s.purchase_price * s.maintenance_pct) / 12;
          return (total - s.monthly_rent) < 800;
        });
        return anyReasonable ? "strong" : "review";
      })(),
      family: familyScenarios.length === 0 ? "not-started" : "review",
      career: careerScenarios.length === 0 ? "not-started" : (
        careerScenarios.some((s) => s.new_monthly_income >= s.current_monthly_income) ? "strong" : "review"
      ),
      education: educationScenarios.length === 0 ? "not-started" : (() => {
        const coverages = educationScenarios.map((s) => {
          const yu = Math.max(0, 18 - s.child_current_age);
          const cost = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yu) * s.years_in_college;
          const r = Number(s.investment_return) / 12;
          const n = yu * 12;
          const bal = Number(s.current_529_balance);
          const pmt = Number(s.monthly_contribution);
          const fv = n === 0 ? bal : bal * Math.pow(1 + r, n) + (r > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : pmt * n);
          return cost > 0 ? (fv / cost) * 100 : 100;
        });
        const min = Math.min(...coverages);
        return min >= 80 ? "strong" : min >= 50 ? "review" : "alert";
      })(),
      car: carScenarios.length === 0 ? "not-started" : (() => {
        const s = carScenarios[0];
        const isFinCar = s.purchase_type === "finance";
        const rCar = Number(s.new_interest_rate) / 12;
        const nCar = Number(s.new_loan_term_months);
        const curEqCar = Math.max(0, Number(s.current_car_value) - Number(s.current_loan_balance));
        const financedCar = isFinCar ? Math.max(0, Number(s.new_car_price) - Number(s.new_down_payment) - curEqCar) : 0;
        const calcNewPmt = isFinCar && financedCar > 0 && rCar > 0 ? financedCar * rCar * Math.pow(1 + rCar, nCar) / (Math.pow(1 + rCar, nCar) - 1) : isFinCar ? financedCar / Math.max(1, nCar) : 0;
        const moDelta = Number(s.new_car_price) > 0
          ? calcNewPmt + Number(s.new_monthly_insurance) - Number(s.current_monthly_payment) - Number(s.current_monthly_insurance)
          : 0;
        const moDeltaPct = Number(s.current_monthly_payment) + Number(s.current_monthly_insurance) > 0
          ? (moDelta / (Number(s.current_monthly_payment) + Number(s.current_monthly_insurance))) * 100 : 0;
        return moDelta <= 0 ? "strong" : moDeltaPct <= 10 ? "review" : "alert";
      })(),
      sabbatical: sabbaticalScenarios.length === 0 ? "not-started" : (() => {
        const s = sabbaticalScenarios[0];
        if ((s.break_type ?? "sabbatical") === "vacation") {
          const totalCost = Number(s.vacation_travel_costs ?? 500) + Number(s.vacation_daily_budget ?? 200) * Number(s.vacation_duration_days ?? 7);
          const liquid = Number(s.liquid_assets_available) || 0;
          const pct = liquid > 0 ? totalCost / liquid : 1;
          return liquid >= totalCost && pct <= 0.30 ? "strong" : liquid >= totalCost ? "review" : "alert";
        }
        const burn = Math.max(0, Number(s.monthly_expenses_during) - Number(s.monthly_stipend));
        const runway = burn > 0 ? Number(s.liquid_assets_available) / burn : 999;
        const canAfford = runway >= s.sabbatical_months;
        const buffer = runway - s.sabbatical_months;
        return canAfford && buffer >= 3 ? "strong" : canAfford ? "review" : "alert";
      })(),
    };

    // Readiness score
    const retirScore = retirementProb != null ? retirementProb : 50;
    const nonEmptyCount = [homeScenarios, familyScenarios, careerScenarios, educationScenarios].filter((a) => a.length > 0).length;
    const futureReadinessScore = Math.round(retirScore * 0.5 + healthData.total * 0.3 + (nonEmptyCount / 4) * 20);

    // Score deductions + actions (P1)
    type Deduction = { label: string; points: number; href?: string };
    const scoreDeductions: Deduction[] = [];
    if (homeScenarios.length === 0) scoreDeductions.push({ label: "Home planning not started", points: -5, href: "/planning/home" });
    if (familyScenarios.length === 0) scoreDeductions.push({ label: "Family planning not started", points: -4, href: "/planning/family" });
    if (careerScenarios.length === 0) scoreDeductions.push({ label: "Career planning not started", points: -4, href: "/planning/career" });
    if (educationScenarios.length === 0) scoreDeductions.push({ label: "Education planning not started", points: -4, href: "/planning/education" });
    if (retirementProb != null && retirementProb < 80) {
      const pen = Math.round((80 - retirementProb) * 0.4);
      if (pen >= 3) scoreDeductions.push({ label: `Retirement probability ${Math.round(retirementProb)}%`, points: -pen });
    }
    scoreDeductions.sort((a, b) => a.points - b.points);

    const scoreActions: string[] = [];
    if (homeScenarios.length === 0) scoreActions.push("Model a home purchase scenario");
    if (familyScenarios.length === 0) scoreActions.push("Add family planning scenarios");
    if (educationScenarios.length === 0) scoreActions.push("Add education / 529 planning");
    if (careerScenarios.length === 0) scoreActions.push("Model a career change scenario");

    // Per-planner metrics (P2)
    const homeMetrics = homeScenarios.length > 0 ? (() => {
      const s = homeScenarios[0];
      const loan = s.purchase_price - s.down_payment;
      const r = s.mortgage_rate / 12;
      const n = s.loan_term_years * 12;
      const pmt = loan > 0 && r > 0 ? loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / (n || 1);
      const total = pmt + s.property_tax_monthly + s.insurance_monthly + s.hoa_monthly + (s.purchase_price * s.maintenance_pct) / 12;
      const ytr = activeYearsToRetire ?? 25;
      const retirImpact = -Math.round(s.down_payment * Math.pow(1 + localAssumptions.return_rate / 100, ytr));
      return { monthlyDelta: Math.round(total - s.monthly_rent), retirImpact, count: homeScenarios.length };
    })() : null;

    const careerMetrics = careerScenarios.length > 0 ? (() => {
      const best = careerScenarios.reduce((b, s) => {
        return Math.abs(s.new_monthly_income - s.current_monthly_income) > Math.abs(b.new_monthly_income - b.current_monthly_income) ? s : b;
      }, careerScenarios[0]);
      const ytr = activeYearsToRetire ?? 20;
      const lifetimeGain = Math.round((best.new_monthly_income - best.current_monthly_income) * 12 * ytr);
      return { lifetimeGain, isPositive: lifetimeGain >= 0, name: best.name };
    })() : null;

    const educationMetrics = educationScenarios.length > 0 ? (() => {
      const results = educationScenarios.map((s) => {
        const yu = Math.max(0, 18 - s.child_current_age);
        const totalCost = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yu) * s.years_in_college;
        const r = Number(s.investment_return) / 12;
        const n = yu * 12;
        const bal = Number(s.current_529_balance);
        const pmt = Number(s.monthly_contribution);
        const fv = n === 0 ? bal : bal * Math.pow(1 + r, n) + (r > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : pmt * n);
        return { cov: totalCost > 0 ? (fv / totalCost) * 100 : 100, gap: Math.max(0, totalCost - fv) };
      });
      return {
        coverage: Math.round(results.reduce((s, r) => s + r.cov, 0) / results.length),
        gap: Math.round(results.reduce((s, r) => s + r.gap, 0)),
      };
    })() : null;

    const familyMetrics = familyScenarios.length > 0 ? (() => {
      let total = 0;
      for (const s of familyScenarios) {
        const ca = s.child_current_age;
        const infantYrs = ca < 3 ? 3 - ca : 0;
        const childStart = Math.max(3, ca);
        const childYrs = childStart < 13 ? 13 - childStart : 0;
        const teenStart = Math.max(13, ca);
        const teenYrs = teenStart < 18 ? 18 - teenStart : 0;
        total += Number(s.monthly_infant_cost) * 12 * infantYrs
               + Number(s.monthly_child_cost) * 12 * childYrs
               + Number(s.monthly_teen_cost) * 12 * teenYrs;
      }
      return { lifetimeCost: Math.round(total), count: familyScenarios.length };
    })() : null;

    const sabbaticalMetrics = sabbaticalScenarios.length > 0 ? (() => {
      const s = sabbaticalScenarios[0];
      if ((s.break_type ?? "sabbatical") === "vacation") {
        const totalCost = Number(s.vacation_travel_costs ?? 500) + Number(s.vacation_daily_budget ?? 200) * Number(s.vacation_duration_days ?? 7);
        const liquid = Number(s.liquid_assets_available) || 0;
        const isFunded = liquid >= totalCost;
        const monthlySav = Math.max(0, effectiveIncome - effectiveExpenses);
        const shortfall = Math.max(0, totalCost - liquid);
        const monthsToSave = monthlySav > 0 && !isFunded ? Math.ceil(shortfall / monthlySav) : 0;
        const verdict = isFunded ? "BOOK_IT" as const : monthlySav > 0 ? "SAVE_MORE" as const : "RECONSIDER" as const;
        return { verdict, runwayMonths: isFunded ? 999 : monthsToSave, sabbaticalMonths: Number(s.vacation_duration_days ?? 7), recoveryMonths: Math.ceil(totalCost / Math.max(1, monthlySav)), name: s.name };
      }
      const burn = Math.max(0, Number(s.monthly_expenses_during) - Number(s.monthly_stipend));
      const runway = burn > 0 ? Number(s.liquid_assets_available) / burn : 999;
      const canAfford = runway >= s.sabbatical_months;
      const buffer = runway - s.sabbatical_months;
      const verdict = canAfford && buffer >= 3 ? "GO" as const : canAfford ? "PLAN" as const : "NOT_YET" as const;
      const netSavingsAfter = Number(s.monthly_income_after_return) - effectiveExpenses;
      const depletion = s.sabbatical_months * burn;
      const recoveryMonths = netSavingsAfter > 0 ? Math.ceil(depletion / netSavingsAfter) : null;
      return { verdict, runwayMonths: runway, sabbaticalMonths: s.sabbatical_months, recoveryMonths, name: s.name };
    })() : null;

    const carMetrics = carScenarios.length > 0 ? (() => {
      const s = carScenarios[0];
      const isFinance = s.purchase_type === "finance";
      const r = Number(s.new_interest_rate) / 12;
      const n = Number(s.new_loan_term_months);
      const curEquity = Math.max(0, Number(s.current_car_value) - Number(s.current_loan_balance));
      const financed = isFinance ? Math.max(0, Number(s.new_car_price) - Number(s.new_down_payment) - curEquity) : 0;
      const newPayment = isFinance && financed > 0 && r > 0 ? financed * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : isFinance ? financed / n : 0;
      const curTotalMo = Number(s.current_monthly_payment) + Number(s.current_monthly_insurance);
      const newTotalMo = newPayment + Number(s.new_monthly_insurance);
      const moDelta = newTotalMo - curTotalMo;
      const moDeltaPct = curTotalMo > 0 ? (moDelta / curTotalMo) * 100 : 0;
      const verdict = moDelta <= -100 ? "SMART_MOVE" as const : moDeltaPct <= 10 ? "MANAGEABLE" as const : moDeltaPct <= 25 ? "BUDGET_STRETCH" as const : "KEEP_CURRENT" as const;
      return { verdict, moDelta, moDeltaPct, newMonthlyPayment: newPayment, name: s.name };
    })() : null;

    // Timeline with placeholders (P5)
    type TItem = { year: number; label: string; type: "retirement" | "home" | "family" | "career" | "education" | "event" | "placeholder"; detail: string; isPlaceholder?: boolean; };
    const timelineItems: TItem[] = [];
    if (profile?.current_age != null && activeRetirementAge != null) {
      timelineItems.push({
        year: currentYear + (activeRetirementAge - profile.current_age),
        label: "Target Retirement",
        type: "retirement",
        detail: retirementProb != null ? `${Math.round(retirementProb)}% probability` : `Age ${activeRetirementAge}`,
      });
    } else {
      timelineItems.push({ year: currentYear + 30, label: "Retirement", type: "placeholder", detail: "Set your age to project", isPlaceholder: true });
    }
    for (const s of educationScenarios) {
      const yu = Math.max(0, 18 - s.child_current_age);
      timelineItems.push({ year: currentYear + yu, label: s.child_name ? `${s.child_name} starts college` : "College start", type: "education", detail: s.name });
    }
    for (const s of careerScenarios) {
      timelineItems.push({ year: currentYear + 1, label: s.name, type: "career", detail: `$${Math.round(s.new_monthly_income * 12).toLocaleString()}/yr` });
    }
    for (const ev of futureEvents) {
      timelineItems.push({ year: ev.event_year, label: ev.label, type: "event", detail: (ev.amount_impact >= 0 ? "+" : "") + fmt(ev.amount_impact) });
    }
    if (homeScenarios.length === 0) timelineItems.push({ year: currentYear + 3, label: "Potential Home Purchase", type: "placeholder", detail: "Not yet modeled", isPlaceholder: true });
    if (familyScenarios.length === 0 && educationScenarios.length === 0) timelineItems.push({ year: currentYear + 5, label: "Potential Family Event", type: "placeholder", detail: "Not yet modeled", isPlaceholder: true });
    timelineItems.sort((a, b) => a.year - b.year);

    // Next Action
    type NextAction = { title: string; description: string; href: string; priority: "high" | "medium"; };
    let nextAction: NextAction | null = null;
    if (educationScenarios.length > 0) {
      const worstCov = Math.min(...educationScenarios.map((s) => {
        const yu = Math.max(0, 18 - s.child_current_age);
        const cost = Number(s.annual_cost_today) * Math.pow(1 + Number(s.cost_inflation_rate), yu) * s.years_in_college;
        const r = Number(s.investment_return) / 12;
        const n = yu * 12;
        const bal = Number(s.current_529_balance);
        const pmt = Number(s.monthly_contribution);
        const fv = n === 0 ? bal : bal * Math.pow(1 + r, n) + (r > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : pmt * n);
        return cost > 0 ? (fv / cost) * 100 : 100;
      }));
      if (worstCov < 60) {
        nextAction = { title: "Increase 529 contributions", description: `Your education scenario is at ${Math.round(worstCov)}% coverage. Boosting contributions now has the highest compounding impact.`, href: "/planning/education", priority: "high" };
      }
    }
    if (!nextAction && retirementProb != null && retirementProb < 70) {
      nextAction = { title: "Review retirement trajectory", description: `Retirement probability is ${Math.round(retirementProb)}%. Adjusting your savings rate or target age can close the gap.`, href: "/planning?tab=overview", priority: "high" };
    }
    if (!nextAction && homeScenarios.length === 0) {
      nextAction = { title: "Model a home scenario", description: "Housing is often the largest financial decision you'll make. Understanding the buy vs. rent numbers now gives you a clear roadmap.", href: "/planning/home", priority: "medium" };
    }
    if (!nextAction && savingsRate < 15 && effectiveIncome > 0) {
      nextAction = { title: "Boost your savings rate", description: `Current savings rate is ${savingsRate.toFixed(1)}%. Targeting 15-20% is the single biggest lever for long-term security.`, href: "/planning?tab=cashflow", priority: "medium" };
    }

    // Cross-planner insights
    type Insight = { text: string; type: "positive" | "warning" | "info"; };
    const insights: Insight[] = [];
    if (familyScenarios.length > 0 && educationScenarios.length > 0) {
      insights.push({ text: "Child costs and 529 contributions overlap during peak earning years — coordinate timing to avoid cash flow strain.", type: "info" });
    }
    if (retirementProb != null && retirementProb >= 80 && educationScenarios.length > 0) {
      insights.push({ text: "Retirement is well-funded. Surplus capacity can be redirected to 529 contributions without delaying retirement.", type: "positive" });
    }
    if (careerScenarios.some((s) => s.new_monthly_income < s.current_monthly_income)) {
      insights.push({ text: "A career scenario involves a pay cut. Ensure your emergency fund covers at least 6 months before transitioning.", type: "warning" });
    }
    if (homeScenarios.length > 0) {
      const totalDP = homeScenarios.reduce((sum, s) => sum + s.down_payment, 0);
      if (liquidAssets > 0 && totalDP > liquidAssets * 0.5) {
        insights.push({ text: "Home down payment scenarios would consume more than half your liquid assets. Retain an emergency buffer.", type: "warning" });
      }
    }

    // Annual impact ranking
    type ImpactItem = { label: string; annualImpact: number; source: string; };
    const impactItems: ImpactItem[] = [];
    for (const ev of futureEvents) {
      impactItems.push({ label: ev.label, annualImpact: ev.amount_impact, source: "event" });
    }
    for (const s of familyScenarios) {
      const age = s.child_current_age;
      const monthly = age < 3 ? Number(s.monthly_infant_cost) : age <= 12 ? Number(s.monthly_child_cost) : Number(s.monthly_teen_cost);
      impactItems.push({ label: `${s.child_name ?? s.name} (child costs)`, annualImpact: -(monthly * 12), source: "family" });
    }
    for (const s of careerScenarios) {
      const annualDelta = (s.new_monthly_income - s.current_monthly_income) * 12;
      if (Math.abs(annualDelta) > 0) impactItems.push({ label: `${s.name} (income)`, annualImpact: annualDelta, source: "career" });
    }
    impactItems.sort((a, b) => Math.abs(b.annualImpact) - Math.abs(a.annualImpact));

    // P2: Largest future decisions (lifetime impact, ranked)
    type BigDecision = { label: string; impact: number; href: string; positive: boolean; detail: string; };
    const biggestDecisions: BigDecision[] = [];
    if (careerMetrics) biggestDecisions.push({ label: "Career Change", impact: careerMetrics.lifetimeGain, href: "/planning/career", positive: careerMetrics.isPositive, detail: careerMetrics.name });
    if (homeMetrics) biggestDecisions.push({ label: "Home Purchase", impact: homeMetrics.retirImpact, href: "/planning/home", positive: false, detail: `${homeMetrics.monthlyDelta >= 0 ? "+" : ""}${Math.round(homeMetrics.monthlyDelta).toLocaleString()}/mo vs rent` });
    if (familyMetrics && familyMetrics.lifetimeCost > 0) biggestDecisions.push({ label: "Child Costs", impact: -familyMetrics.lifetimeCost, href: "/planning/family", positive: false, detail: `${familyMetrics.count} ${familyMetrics.count === 1 ? "child" : "children"} modeled` });
    if (educationMetrics && educationMetrics.gap > 0) biggestDecisions.push({ label: "Education Gap", impact: -educationMetrics.gap, href: "/planning/education", positive: false, detail: `${educationMetrics.coverage}% funded` });
    biggestDecisions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    // P3: Score component breakdown
    const scoreBreakdown = {
      retirementPts: Math.round(retirScore * 0.5),
      healthPts: Math.round(healthData.total * 0.3),
      planningPts: Math.round((nonEmptyCount / 4) * 20),
      retirBase: Math.round(retirScore),
      healthBase: healthData.total,
      plannerCount: nonEmptyCount,
    };

    // P4: Timeline split — near-term vs retirement milestone
    const retirementMilestone = timelineItems.find(t => t.type === "retirement");
    const nearTermItems = timelineItems.filter(t => t.year <= currentYear + 12 && t.type !== "retirement");

    // Conflict Detection Engine
    const conflictAlerts = computeConflictAlerts({
      homeScenarios, familyScenarios, educationScenarios, careerScenarios, futureEvents,
      profile, currentYear, monthlySavings, liquidAssets, effectiveExpenses, retirementProb,
    });

    // Full roadmap (all events from now to retirement + 3 years)
    const retirYear = profile?.current_age != null && activeRetirementAge != null
      ? currentYear + (activeRetirementAge - profile.current_age)
      : currentYear + 35;
    const roadmapItems = timelineItems
      .filter((t) => t.year >= currentYear && t.year <= retirYear + 3)
      .sort((a, b) => a.year - b.year);
    // Auto-inject FI milestone if not already in roadmap
    const conflictYears = new Set(conflictAlerts.flatMap((a) => a.years));

    // Financial Independence estimate: years until net_worth * (1+r)^n + PMT*... >= 25 * annual_expenses.
    // FI does NOT net Social Security — it can arrive well before SS eligibility, so the portfolio
    // must cover full expenses on its own.
    let fiYear: number | null = null;
    const annualExpenses = effectiveExpenses * 12;
    const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
    if (fiTarget > 0 && netWorth > 0) {
      const r = localAssumptions.return_rate / 100;
      const annualSavings = monthlySavings * 12;
      for (let y = 1; y <= 50; y++) {
        const projected = netWorth * Math.pow(1 + r, y) + (annualSavings > 0 && r > 0 ? annualSavings * ((Math.pow(1 + r, y) - 1) / r) : annualSavings * y);
        if (projected >= fiTarget) { fiYear = currentYear + y; break; }
      }
    }

    return {
      plannerHealth,
      futureReadinessScore,
      scoreDeductions: scoreDeductions.slice(0, 4),
      scoreActions: scoreActions.slice(0, 4),
      scoreBreakdown,
      homeMetrics,
      careerMetrics,
      educationMetrics,
      familyMetrics,
      sabbaticalMetrics,
      carMetrics,
      biggestDecisions,
      nearTermItems,
      roadmapItems,
      conflictAlerts,
      conflictYears,
      fiYear,
      retirementMilestone: retirementMilestone ?? null,
      nextAction,
      insights,
      hasRealInsights: insights.length > 0,
      impactItems: impactItems.slice(0, 8),
      projectedNWAtRetirement: retirementPoint?.baseline ?? null,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScenarios, familyScenarios, careerScenarios, educationScenarios, sabbaticalScenarios, carScenarios, futureEvents,
      retirementProb, retirementPoint, healthData.total, profile?.current_age,
      activeRetirementAge, currentYear, savingsRate, effectiveIncome, liquidAssets,
      monthlySavings, effectiveExpenses, netWorth, localAssumptions.return_rate]);

  // Combine historical + deterministic forecast for chart
  const historyForChart = netWorthHistory.map((s) => ({
    label: s.snapshot_date,
    historical: s.net_worth,
    optimistic: null as number | null,
    baseline: null as number | null,
    pessimistic: null as number | null,
  }));
  const whatIfActiveBands = whatIfScenario && whatIfImpacts
    ? whatIfImpacts[whatIfScenario].bands
    : null;
  const forecastForChart = forecastBands.map((p, i) => ({
    label: p.label,
    historical: null as number | null,
    optimistic: p.optimistic,
    baseline: p.baseline,
    pessimistic: p.pessimistic,
    whatif: whatIfActiveBands ? (whatIfActiveBands[i]?.baseline ?? null) : (null as number | null),
  }));
  const chartData = [...historyForChart, ...forecastForChart];

  // Key milestone rows for year-by-year table
  const tableRows = forecastBands.filter((p) =>
    forecastBands.length <= 12 || p.year % 5 === 0 || p.year === activeYearsToRetire
  );

  // Monte Carlo — only computed when toggle is on.
  // Target is 25x the spending NOT covered by guaranteed income (Social Security).
  const retirementTarget = retirementPoint
    ? Math.max(0, retirementPoint.annualExpenses - annualRetirementIncomeAtRetire) * 25
    : null;
  const mcResult = useMemo(() => {
    if (!showMonteCarlo) return null;
    return runMonteCarlo(
      netWorth, effectiveIncome, effectiveExpenses,
      forecastYears,
      localAssumptions.return_rate / 100,
      localAssumptions.inflation_rate / 100,
      localAssumptions.salary_growth_rate / 100,
      planLifeEvents, currentYear,
      activeYearsToRetire,
      retirementTarget,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonteCarlo, netWorth, effectiveIncome, effectiveExpenses, forecastYears,
      localAssumptions.return_rate, localAssumptions.inflation_rate, localAssumptions.salary_growth_rate,
      planLifeEvents, currentYear, activeYearsToRetire, retirementTarget]);

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

  // ── XLSX Export (styled) ──────────────────────────────────────────────────
  function exportForecastXLSX() {
    // ── Style primitives ────────────────────────────────────────────────────
    const C = {
      navy:       "0F172A",
      navyMid:    "1E293B",
      blue:       "1D4ED8",
      blueMid:    "2563EB",
      bluePale:   "EFF6FF",
      green:      "166534",
      greenPale:  "DCFCE7",
      red:        "991B1B",
      redPale:    "FEE2E2",
      amber:      "92400E",
      amberPale:  "FEF3C7",
      white:      "FFFFFF",
      offWhite:   "F8FAFC",
      border:     "CBD5E1",
      textMuted:  "64748B",
    };

    const border = (color = C.border) => ({
      top:    { style: "thin", color: { rgb: color } },
      bottom: { style: "thin", color: { rgb: color } },
      left:   { style: "thin", color: { rgb: color } },
      right:  { style: "thin", color: { rgb: color } },
    });

    function cell(
      value: string | number | null,
      opts: {
        bold?: boolean; italic?: boolean; sz?: number;
        fgColor?: string; fontColor?: string;
        numFmt?: string; align?: "left" | "center" | "right";
        wrapText?: boolean; bordered?: boolean; topBorderThick?: boolean;
      } = {}
    ) {
      const isNum = typeof value === "number";
      return {
        t: value === null ? "z" : isNum ? "n" : "s",
        v: value ?? undefined,
        z: opts.numFmt,
        s: {
          font: {
            bold: opts.bold ?? false,
            italic: opts.italic ?? false,
            sz: opts.sz ?? 10,
            color: { rgb: opts.fontColor ?? (opts.fgColor ? C.white : C.navy) },
            name: "Calibri",
          },
          fill: opts.fgColor ? { fgColor: { rgb: opts.fgColor }, patternType: "solid" } : { patternType: "none" },
          alignment: { horizontal: opts.align ?? (isNum ? "right" : "left"), vertical: "center", wrapText: opts.wrapText },
          border: opts.bordered
            ? (opts.topBorderThick
                ? { ...border(), top: { style: "medium", color: { rgb: C.navy } } }
                : border())
            : {},
        },
      };
    }

    const titleCell   = (v: string) => cell(v, { bold: true, sz: 14, fgColor: C.navy,    fontColor: C.white, align: "left" });
    const sectionCell = (v: string, color = C.blue) =>
      cell(v, { bold: true, sz: 10, fgColor: color, fontColor: C.white, align: "left" });
    const headerCell  = (v: string) => cell(v, { bold: true, sz: 10, fgColor: C.navyMid, fontColor: C.white, align: "center", bordered: true });
    const labelCell   = (v: string, shade = false) =>
      cell(v, { bold: false, sz: 10, fgColor: shade ? C.offWhite : C.white, fontColor: C.navy, align: "left", bordered: true });
    const metricLabel = (v: string) => cell(v, { sz: 10, fontColor: C.textMuted, align: "left", bordered: true, fgColor: C.white });
    const moneyCell   = (v: number, shade = false, positive?: boolean) =>
      cell(v, { sz: 10, numFmt: '"$"#,##0', bordered: true, fgColor: shade ? C.offWhite : C.white,
                fontColor: positive === true ? C.green : positive === false ? C.red : C.navy, align: "right" });
    const pctCell     = (v: number, shade = false) =>
      cell(v / 100, { sz: 10, numFmt: "0.0%", bordered: true, fgColor: shade ? C.offWhite : C.white, fontColor: C.navy, align: "right" });
    const totalMoney  = (v: number, color: string) =>
      cell(v, { bold: true, sz: 11, numFmt: '"$"#,##0', bordered: true, topBorderThick: true,
                fgColor: color === "green" ? C.greenPale : C.redPale,
                fontColor: color === "green" ? C.green : C.red, align: "right" });
    const emptyCell   = () => cell(null, { fgColor: C.white });
    const shadedEmpty = () => cell(null, { fgColor: C.offWhite });

    const merge = (r1: number, c1: number, r2: number, c2: number) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

    function setCell(ws: Record<string, unknown>, row: number, col: number, c: unknown) {
      const addr = XLSXStyle.utils.encode_cell({ r: row, c: col });
      ws[addr] = c;
    }

    function setRow(ws: Record<string, unknown>, row: number, cells: unknown[]) {
      cells.forEach((c, col) => setCell(ws, row, col, c));
    }

    function finalizeSheet(ws: Record<string, unknown>, maxRow: number, maxCol: number) {
      ws["!ref"] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    }

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const wb = XLSXStyle.utils.book_new();

    // ────────────────────────────────────────────────────────────────────────
    // Sheet 1: Summary
    // ────────────────────────────────────────────────────────────────────────
    {
      const ws: Record<string, unknown> = {};
      let r = 0;

      // Title banner (spans 4 cols)
      setRow(ws, r++, [
        titleCell("BuyTune  ·  Financial Planning Report"),
        cell("", { fgColor: C.navy }), cell("", { fgColor: C.navy }), cell("", { fgColor: C.navy }),
      ]);
      setRow(ws, r++, [
        cell(`Generated ${today}  ·  Confidential`, { sz: 9, italic: true, fgColor: C.navyMid, fontColor: "94A3B8", align: "left" }),
        cell("", { fgColor: C.navyMid }), cell("", { fgColor: C.navyMid }), cell("", { fgColor: C.navyMid }),
      ]);
      setRow(ws, r++, [emptyCell(), emptyCell(), emptyCell(), emptyCell()]);

      // Key Metrics section
      setRow(ws, r++, [sectionCell("  KEY METRICS"), cell("", { fgColor: C.blue }), sectionCell("  RETIREMENT OUTLOOK"), cell("", { fgColor: C.blue })]);

      const metricsLeft: [string, number | string, string?][] = [
        ["Net Worth",       netWorth,          netWorth >= 0 ? "$" : "-$"],
        ["Monthly Income",  effectiveIncome,   "$"],
        ["Monthly Expenses", effectiveExpenses, "$"],
        ["Monthly Savings", monthlySavings,    monthlySavings >= 0 ? "$" : "-$"],
        ["Savings Rate",    savingsRate / 100, "%"],
        ["Health Score",    healthData.total,  "/100"],
      ];
      const metricsRight: [string, number | string][] = [
        ["Current Age",           profile?.current_age ?? "—"],
        ["Target Retirement Age", activeRetirementAge ?? "—"],
        ["Years to Retirement",   yearsToRetire ?? "—"],
        ["Projected NW (baseline)", retirementPoint ? Math.round(retirementPoint.baseline) : "—"],
        ["Retirement Probability",  retirementProb != null ? `${retirementProb}%` : "—"],
        ["Model: Return Rate",      `${localAssumptions.return_rate.toFixed(1)}%`],
      ];

      const maxMetricRows = Math.max(metricsLeft.length, metricsRight.length);
      for (let i = 0; i < maxMetricRows; i++) {
        const shade = i % 2 === 1;
        const ml = metricsLeft[i];
        const mr = metricsRight[i];
        const leftLabel = ml ? metricLabel(ml[0]) : shadedEmpty();
        let leftVal;
        if (!ml) {
          leftVal = shadedEmpty();
        } else if (ml[2] === "%" ) {
          leftVal = pctCell(typeof ml[1] === "number" ? ml[1] * 100 : 0, shade);
        } else if (typeof ml[1] === "number") {
          leftVal = moneyCell(Math.abs(ml[1]), shade, ml[1] >= 0 ? undefined : false);
        } else {
          leftVal = cell(String(ml[1]), { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, align: "right" });
        }
        const rightLabel = mr ? metricLabel(mr[0]) : shadedEmpty();
        const rightVal = mr
          ? typeof mr[1] === "number"
            ? moneyCell(mr[1], shade)
            : cell(String(mr[1]), { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, align: "right" })
          : shadedEmpty();
        setRow(ws, r++, [leftLabel, leftVal, rightLabel, rightVal]);
      }

      // Assumptions section
      r++;
      setRow(ws, r++, [sectionCell("  MODEL ASSUMPTIONS"), cell("", { fgColor: C.blue }), sectionCell("  FINANCIAL HEALTH BREAKDOWN"), cell("", { fgColor: C.blue })]);
      const assumpLeft: [string, string][] = [
        ["Expected Annual Return", `${localAssumptions.return_rate.toFixed(1)}%`],
        ["Inflation Rate",         `${localAssumptions.inflation_rate.toFixed(1)}%`],
        ["Salary Growth Rate",     `${localAssumptions.salary_growth_rate.toFixed(1)}%`],
      ];
      const scoreRight: [string, string][] = healthData.factors.map((f) => [
        f.name, `${f.score}/${f.max}  ${f.direction === "strength" ? "✓" : f.direction === "weakness" ? "⚠" : "~"}`
      ]);
      const maxAssump = Math.max(assumpLeft.length, scoreRight.length);
      for (let i = 0; i < maxAssump; i++) {
        const shade = i % 2 === 1;
        const al = assumpLeft[i];
        const sr2 = scoreRight[i];
        setRow(ws, r++, [
          al ? metricLabel(al[0]) : shadedEmpty(),
          al ? cell(al[1], { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, align: "right" }) : shadedEmpty(),
          sr2 ? metricLabel(sr2[0]) : shadedEmpty(),
          sr2 ? cell(sr2[1], { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, align: "right",
                               fontColor: scoreRight[i] ? (healthData.factors[i]?.direction === "strength" ? C.green : healthData.factors[i]?.direction === "weakness" ? C.red : C.amber) : C.navy }) : shadedEmpty(),
        ]);
      }

      // Disclaimer
      r++;
      setRow(ws, r++, [
        cell("This report is auto-generated by BuyTune and is for informational purposes only. It does not constitute financial advice.", {
          sz: 8, italic: true, fontColor: C.textMuted, align: "left", wrapText: true,
          fgColor: C.offWhite,
        }),
        cell("", { fgColor: C.offWhite }), cell("", { fgColor: C.offWhite }), cell("", { fgColor: C.offWhite }),
      ]);

      finalizeSheet(ws, r, 3);
      ws["!merges"] = [
        merge(0, 0, 0, 3), merge(1, 0, 1, 3),
        merge(3, 0, 3, 1), merge(3, 2, 3, 3),
        merge(r - 1 - 1, 0, r - 1 - 1, 3), // section headers (assump + health) merge
        merge(r - 1, 0, r - 1, 3),
      ];
      ws["!cols"] = [{ wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 18 }];
      ws["!rows"] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }];
      XLSXStyle.utils.book_append_sheet(wb, ws, "Summary");
    }

    // ────────────────────────────────────────────────────────────────────────
    // Sheet 2: Net Worth Forecast
    // ────────────────────────────────────────────────────────────────────────
    {
      const ws: Record<string, unknown> = {};
      let r = 0;
      const COLS = 6;

      setRow(ws, r++, [
        titleCell("Net Worth Forecast"),
        ...Array(COLS - 1).fill(cell("", { fgColor: C.navy })),
      ]);
      setRow(ws, r++, [
        cell(`Baseline: ${localAssumptions.return_rate.toFixed(1)}% return · ${localAssumptions.inflation_rate.toFixed(1)}% inflation · ${localAssumptions.salary_growth_rate.toFixed(1)}% salary growth`, {
          sz: 9, italic: true, fgColor: C.navyMid, fontColor: "94A3B8",
        }),
        ...Array(COLS - 1).fill(cell("", { fgColor: C.navyMid })),
      ]);
      r++;

      setRow(ws, r++, [
        headerCell("Year"),
        headerCell("Pessimistic"),
        headerCell("Baseline"),
        headerCell("Optimistic"),
        headerCell("Annual Expenses"),
        headerCell("Notes"),
      ]);

      forecastBands.forEach((p, i) => {
        const isRetire = activeYearsToRetire != null && p.year === activeYearsToRetire;
        const shade = i % 2 === 1;
        const bg = isRetire ? C.bluePale : undefined;
        const fgOverride = isRetire ? C.blue : undefined;

        setRow(ws, r++, [
          cell(p.label, { sz: 10, bordered: true, bold: isRetire, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? C.navy }),
          cell(p.pessimistic, { sz: 10, numFmt: '"$"#,##0', bordered: true, bold: isRetire, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? (p.pessimistic >= 0 ? C.green : C.red), align: "right" }),
          cell(p.baseline,    { sz: 10, numFmt: '"$"#,##0', bordered: true, bold: isRetire, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? C.navy, align: "right" }),
          cell(p.optimistic,  { sz: 10, numFmt: '"$"#,##0', bordered: true, bold: isRetire, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? C.navy, align: "right" }),
          cell(p.annualExpenses, { sz: 10, numFmt: '"$"#,##0', bordered: true, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? C.textMuted, align: "right" }),
          cell(isRetire ? "← Retirement Year" : "", { sz: 10, bordered: true, bold: isRetire, fgColor: bg ?? (shade ? C.offWhite : C.white), fontColor: fgOverride ?? C.textMuted }),
        ]);
      });

      finalizeSheet(ws, r, COLS - 1);
      ws["!merges"] = [merge(0, 0, 0, COLS - 1), merge(1, 0, 1, COLS - 1)];
      ws["!cols"] = [{ wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
      ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }];
      ws["!freeze"] = { xSplit: 0, ySplit: 4 };
      XLSXStyle.utils.book_append_sheet(wb, ws, "Forecast");
    }

    // ────────────────────────────────────────────────────────────────────────
    // Sheet 3: Balance Sheet
    // ────────────────────────────────────────────────────────────────────────
    if (balanceItems.length > 0) {
      const ws: Record<string, unknown> = {};
      let r = 0;
      const COLS = 3;

      setRow(ws, r++, [titleCell("Balance Sheet"), cell("", { fgColor: C.navy }), cell("", { fgColor: C.navy })]);
      setRow(ws, r++, [cell(`As of ${today}`, { sz: 9, italic: true, fgColor: C.navyMid, fontColor: "94A3B8" }), cell("", { fgColor: C.navyMid }), cell("", { fgColor: C.navyMid })]);
      r++;

      // Assets
      setRow(ws, r++, [sectionCell("  ASSETS", "166534"), cell("", { fgColor: "166534" }), sectionCell("", "166534")]);
      const assetItems = balanceItems.filter((i) => !i.is_liability);
      assetItems.forEach((item, i) => {
        const shade = i % 2 === 1;
        setRow(ws, r++, [
          labelCell(item.label, shade),
          cell(item.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), { sz: 9, bordered: true, fgColor: shade ? C.offWhite : C.white, fontColor: C.textMuted }),
          moneyCell(item.value, shade),
        ]);
      });
      if (portfolioTotalValue > 0) {
        setRow(ws, r++, [
          labelCell("Investment Portfolios (BuyTune)", assetItems.length % 2 === 1),
          cell("Portfolio", { sz: 9, bordered: true, fgColor: assetItems.length % 2 === 1 ? C.offWhite : C.white, fontColor: C.textMuted }),
          moneyCell(portfolioTotalValue, assetItems.length % 2 === 1),
        ]);
      }
      setRow(ws, r++, [
        cell("Total Assets", { bold: true, sz: 11, bordered: true, topBorderThick: true, fgColor: C.greenPale, fontColor: C.green }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.greenPale }),
        totalMoney(totalAssets, "green"),
      ]);
      r++;

      // Liabilities
      setRow(ws, r++, [sectionCell("  LIABILITIES", "991B1B"), cell("", { fgColor: "991B1B" }), sectionCell("", "991B1B")]);
      const liabItems = balanceItems.filter((i) => i.is_liability);
      liabItems.forEach((item, i) => {
        const shade = i % 2 === 1;
        setRow(ws, r++, [
          labelCell(item.label, shade),
          cell(item.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), { sz: 9, bordered: true, fgColor: shade ? C.offWhite : C.white, fontColor: C.textMuted }),
          moneyCell(item.value, shade, false),
        ]);
      });
      setRow(ws, r++, [
        cell("Total Liabilities", { bold: true, sz: 11, bordered: true, topBorderThick: true, fgColor: C.redPale, fontColor: C.red }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.redPale }),
        totalMoney(totalLiabilities, "red"),
      ]);
      r++;

      // Net Worth
      setRow(ws, r++, [
        cell("NET WORTH", { bold: true, sz: 13, fgColor: netWorth >= 0 ? C.navy : C.navyMid, fontColor: C.white }),
        cell("", { fgColor: netWorth >= 0 ? C.navy : C.navyMid }),
        cell(netWorth, { bold: true, sz: 13, numFmt: '"$"#,##0', fgColor: netWorth >= 0 ? C.navy : C.navyMid, fontColor: netWorth >= 0 ? "34D399" : "F87171", align: "right" }),
      ]);

      finalizeSheet(ws, r, COLS - 1);
      ws["!merges"] = [merge(0, 0, 0, COLS - 1), merge(1, 0, 1, COLS - 1)];
      ws["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 18 }];
      ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }];
      XLSXStyle.utils.book_append_sheet(wb, ws, "Balance Sheet");
    }

    // ────────────────────────────────────────────────────────────────────────
    // Sheet 4: Cash Flow
    // ────────────────────────────────────────────────────────────────────────
    if (cashFlowItems.length > 0) {
      const ws: Record<string, unknown> = {};
      let r = 0;
      const COLS = 4;

      setRow(ws, r++, [titleCell("Monthly Cash Flow"), ...Array(COLS - 1).fill(cell("", { fgColor: C.navy }))]);
      setRow(ws, r++, [cell(`As of ${today}`, { sz: 9, italic: true, fgColor: C.navyMid, fontColor: "94A3B8" }), ...Array(COLS - 1).fill(cell("", { fgColor: C.navyMid }))]);
      r++;

      // Column headers
      setRow(ws, r++, [headerCell("Item"), headerCell("Frequency"), headerCell("Amount"), headerCell("Monthly Equiv.")]);

      // Income
      const incomeItems = cashFlowItems.filter((i) => i.type === "income");
      setRow(ws, r++, [sectionCell("  INCOME", "166534"), cell("", { fgColor: "166534" }), cell("", { fgColor: "166534" }), cell("", { fgColor: "166534" })]);
      incomeItems.forEach((item, i) => {
        const shade = i % 2 === 1;
        setRow(ws, r++, [
          labelCell(item.label, shade),
          cell(item.frequency === "monthly" ? "Monthly" : "Annual", { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, fontColor: C.textMuted }),
          moneyCell(item.amount, shade),
          moneyCell(Math.round(toMonthly(item.amount, item.frequency)), shade, true),
        ]);
      });
      const totalIncome = incomeItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
      setRow(ws, r++, [
        cell("Total Monthly Income", { bold: true, sz: 11, bordered: true, topBorderThick: true, fgColor: C.greenPale, fontColor: C.green }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.greenPale }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.greenPale }),
        totalMoney(Math.round(totalIncome), "green"),
      ]);
      r++;

      // Expenses
      const expenseItems = cashFlowItems.filter((i) => i.type === "expense");
      setRow(ws, r++, [sectionCell("  EXPENSES", "991B1B"), cell("", { fgColor: "991B1B" }), cell("", { fgColor: "991B1B" }), cell("", { fgColor: "991B1B" })]);
      expenseItems.forEach((item, i) => {
        const shade = i % 2 === 1;
        setRow(ws, r++, [
          labelCell(item.label, shade),
          cell(item.frequency === "monthly" ? "Monthly" : "Annual", { sz: 10, bordered: true, fgColor: shade ? C.offWhite : C.white, fontColor: C.textMuted }),
          moneyCell(item.amount, shade),
          moneyCell(Math.round(toMonthly(item.amount, item.frequency)), shade, false),
        ]);
      });
      const totalExpenses = expenseItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
      setRow(ws, r++, [
        cell("Total Monthly Expenses", { bold: true, sz: 11, bordered: true, topBorderThick: true, fgColor: C.redPale, fontColor: C.red }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.redPale }),
        cell("", { bordered: true, topBorderThick: true, fgColor: C.redPale }),
        totalMoney(Math.round(totalExpenses), "red"),
      ]);
      r++;

      // Net savings
      const netSavings = totalIncome - totalExpenses;
      setRow(ws, r++, [
        cell("NET MONTHLY SAVINGS", { bold: true, sz: 13, fgColor: netSavings >= 0 ? C.navy : C.navyMid, fontColor: C.white }),
        cell("", { fgColor: netSavings >= 0 ? C.navy : C.navyMid }),
        cell("", { fgColor: netSavings >= 0 ? C.navy : C.navyMid }),
        cell(Math.round(netSavings), { bold: true, sz: 13, numFmt: '"$"#,##0', fgColor: netSavings >= 0 ? C.navy : C.navyMid, fontColor: netSavings >= 0 ? "34D399" : "F87171", align: "right" }),
      ]);

      finalizeSheet(ws, r, COLS - 1);
      ws["!merges"] = [merge(0, 0, 0, COLS - 1), merge(1, 0, 1, COLS - 1)];
      ws["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
      ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }];
      ws["!freeze"] = { xSplit: 0, ySplit: 4 };
      XLSXStyle.utils.book_append_sheet(wb, ws, "Cash Flow");
    }

    XLSXStyle.writeFile(wb, `buytune-financial-plan-${currentYear}.xlsx`);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commandPriorities = useMemo(() => {
    const base = computeCommandPriorities({
      profile, savingsRate, monthlySavings, effectiveIncome, effectiveExpenses,
      liquidAssets, netWorth, totalAssets, totalLiabilities, retirementProb, yearsToRetire,
      cashFlowItems, homeScenarios, familyScenarios, careerScenarios, educationScenarios, estateProfile,
      localReturn: localAssumptions.return_rate / 100,
    });
    const conflictItems: CommandPriority[] = lifePlan.conflictAlerts
      .filter((a) => a.severity !== "info")
      .map((a, i) => ({
        id: `conflict-${i}`,
        rank: a.severity === "critical" ? 0 : 1,
        urgent: a.severity === "critical",
        tabKey: a.tabKey,
        ctaLabel: "Review events",
        title: a.title,
        why: a.description,
        impact: a.recommendation,
      }));
    return [...conflictItems, ...base].slice(0, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savingsRate, monthlySavings, effectiveIncome, effectiveExpenses, liquidAssets, netWorth,
       totalAssets, totalLiabilities, retirementProb, yearsToRetire,
       homeScenarios, familyScenarios, careerScenarios, educationScenarios,
       localAssumptions.return_rate, lifePlan.conflictAlerts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const systemHealth = useMemo(() => computeSystemHealth({
    profile, assets, liabilities, cashFlowItems,
    homeScenarios, familyScenarios, careerScenarios, educationScenarios, estateProfile,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [profile, assets, liabilities, cashFlowItems,
       homeScenarios, familyScenarios, careerScenarios, educationScenarios, estateProfile]);

  const finnInsight = useMemo(() => computeFinnInsight({
    savingsRate, monthlySavings, effectiveExpenses, liquidAssets, netWorth, totalLiabilities, totalAssets,
    retirementProb, projectedNWAtRetirement: retirementPoint?.baseline ?? null, yearsToRetire, profile,
    localReturn: localAssumptions.return_rate / 100,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [savingsRate, monthlySavings, effectiveExpenses, liquidAssets, netWorth, totalLiabilities, totalAssets,
       retirementProb, retirementPoint?.baseline, yearsToRetire, localAssumptions.return_rate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assetBuckets = useMemo(() => computeAssetBuckets(assets, portfolioTotalValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, portfolioTotalValue]);

  const balanceFinnInsight = useMemo(() => computeBalanceFinnInsight({
    liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, assets,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, assets]);

  const cashFlowHealth = useMemo(() => computeCashFlowHealth({
    savingsRate, monthlyExpenses, effectiveIncome, cashFlowItems,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [savingsRate, monthlyExpenses, effectiveIncome, cashFlowItems]);

  const cashFlowFinnInsight = useMemo(() => computeCashFlowFinnInsight({
    savingsRate, monthlySavings, monthlyExpenses, effectiveIncome, cashFlowItems,
    localReturn: localAssumptions.return_rate / 100,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [savingsRate, monthlySavings, monthlyExpenses, effectiveIncome, cashFlowItems, localAssumptions.return_rate]);

  const biggestDrivers = useMemo(() => computeForecastDrivers({
    netWorth, effectiveIncome, effectiveExpenses, forecastYears,
    localReturn: localAssumptions.return_rate / 100,
    localInflation: localAssumptions.inflation_rate / 100,
    localSalaryGrowth: localAssumptions.salary_growth_rate / 100,
    futureEvents, currentYear,
    baselineAtRetirement: retirementPoint?.baseline ?? null,
    hasHomeScenario: homeScenarios.length > 0,
    hasCareerScenario: careerScenarios.length > 0,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [netWorth, effectiveIncome, effectiveExpenses, forecastYears, localAssumptions.return_rate,
    localAssumptions.inflation_rate, localAssumptions.salary_growth_rate,
    retirementPoint?.baseline, homeScenarios.length, careerScenarios.length]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileSaveError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("kids_json", JSON.stringify(profileKids));
    fd.set("net_monthly_override", netOverride !== null ? String(netOverride) : "");
    startProfileTransition(async () => {
      const result = await upsertFinancialProfile(fd);
      if (result?.error) {
        setProfileSaveError(result.error);
        return;
      }
      setEditingProfile(false);
    });
  }

  // ── Atlas Chat ──────────────────────────────────────────────────────────────

  function buildFinnChatContext(): FinnChatContext {
    const homeScenariosForFinn = homeScenarios.map((s) => {
      const loan = s.purchase_price - s.down_payment;
      const r = s.mortgage_rate / 12;
      const n = s.loan_term_years * 12;
      const monthlyPmt = loan > 0 && r > 0
        ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
        : loan / n;
      const maintMonthly = (s.purchase_price * s.maintenance_pct) / 12;
      const totalMonthly = monthlyPmt + s.property_tax_monthly + s.insurance_monthly + s.hoa_monthly + maintMonthly;
      // Rough equity at hold: appreciate home value, amortize balance
      let balance = loan;
      let homeValue = s.purchase_price;
      const ir = s.mortgage_rate / 12;
      for (let m = 0; m < s.hold_years * 12; m++) {
        homeValue *= 1 + s.expected_appreciation / 12;
        if (balance > 0) {
          const interest = balance * ir;
          const principal = Math.min(monthlyPmt - interest, balance);
          balance = Math.max(0, balance - principal);
        }
      }
      const equityAtHold = homeValue - balance;
      // Simple break-even estimate: find first year homeEquity > rentPortfolio (approximation)
      let breakEven: number | null = null;
      let rentPortfolio = s.down_payment + s.purchase_price * s.closing_cost_pct;
      let bal2 = loan;
      let hv2 = s.purchase_price;
      const investR = s.investment_return / 12;
      for (let y = 1; y <= s.hold_years; y++) {
        for (let m = 0; m < 12; m++) {
          hv2 *= 1 + s.expected_appreciation / 12;
          const rent = s.monthly_rent * Math.pow(1 + s.rent_growth_rate, y - 1 + m / 12);
          const ownCost = totalMonthly;
          const delta = ownCost - rent;
          if (delta > 0) rentPortfolio += delta;
          rentPortfolio *= 1 + investR;
          if (bal2 > 0) {
            const interest = bal2 * ir;
            const principal = Math.min(monthlyPmt - interest, bal2);
            bal2 = Math.max(0, bal2 - principal);
          }
        }
        const equity = hv2 - bal2;
        if (breakEven === null && equity > rentPortfolio) breakEven = y;
      }
      return {
        name: s.name,
        purchase_price: s.purchase_price,
        monthly_payment: Math.round(monthlyPmt),
        total_monthly: Math.round(totalMonthly),
        monthly_rent: s.monthly_rent,
        break_even_year: breakEven,
        equity_at_hold: Math.round(equityAtHold),
        hold_years: s.hold_years,
        down_payment: s.down_payment,
        mortgage_rate_pct: +(s.mortgage_rate * 100).toFixed(2),
      };
    });

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
      home_scenarios: homeScenariosForFinn,
      career_scenarios: careerScenarios.map((s) => {
        const gapYears = s.gap_months / 12;
        const income10Current = s.current_monthly_income * 12 * Math.pow(1 + s.current_growth_rate, 10);
        const income10New = s.gap_months > 0 && 10 < gapYears
          ? 0
          : s.new_monthly_income * 12 * Math.pow(1 + s.new_growth_rate, Math.max(0, 10 - gapYears));
        // Simple cumulative break-even estimate
        let cumCurrent = 0;
        let cumNew = -s.transition_cost;
        let breakEven: number | null = null;
        for (let y = 1; y <= s.projection_years; y++) {
          cumCurrent += s.current_monthly_income * 12 * Math.pow(1 + s.current_growth_rate, y);
          const yearsInNew = Math.max(0, y - gapYears);
          const newIncome = y < gapYears ? 0 : s.new_monthly_income * 12 * Math.pow(1 + s.new_growth_rate, yearsInNew);
          cumNew += newIncome;
          if (breakEven === null && cumNew >= cumCurrent) breakEven = y;
        }
        // Retirement prob delta (simplified)
        const annualExpenses = s.monthly_expenses * 12;
        const retirYears = profile?.current_age && profile?.target_retirement_age
          ? profile.target_retirement_age - profile.current_age : null;
        let nwC = 0, nwN = 0;
        const r = s.investment_return / 12;
        if (retirYears) {
          for (let y = 1; y <= retirYears && y <= s.projection_years; y++) {
            const incC = s.current_monthly_income * 12 * Math.pow(1 + s.current_growth_rate, y);
            const incN = y < gapYears ? 0 : s.new_monthly_income * 12 * Math.pow(1 + s.new_growth_rate, Math.max(0, y - gapYears));
            const svgC = Math.max(0, incC - annualExpenses) / 12;
            const svgN = Math.max(0, incN - annualExpenses) / 12;
            nwC = r > 0 ? nwC * Math.pow(1 + r, 12) + svgC * (Math.pow(1 + r, 12) - 1) / r : nwC + svgC * 12;
            nwN = r > 0 ? nwN * Math.pow(1 + r, 12) + svgN * (Math.pow(1 + r, 12) - 1) / r : nwN + svgN * 12;
          }
        }
        const retirProbs = [1.5, 1.2, 1.0, 0.8, 0.6, 0.4, 0.2];
        const retirVals = [95, 88, 82, 70, 55, 38, 20];
        function toProb(nw: number) {
          if (!annualExpenses || !nw) return null;
          const ratio = nw / (annualExpenses * 25);
          for (let i = 0; i < retirProbs.length; i++) if (ratio >= retirProbs[i]) return retirVals[i];
          return 8;
        }
        return {
          name: s.name,
          current_monthly: s.current_monthly_income,
          new_monthly: s.new_monthly_income,
          gap_months: s.gap_months,
          break_even_year: breakEven,
          income_at_year10_delta: Math.round(income10New - income10Current),
          retirement_prob_current: retirYears ? toProb(nwC) : null,
          retirement_prob_new: retirYears ? toProb(nwN) : null,
        };
      }),
      education_scenarios: educationScenarios.map((s) => {
        const yearsUntil = Math.max(0, 18 - s.child_current_age);
        const inflRate = Number(s.cost_inflation_rate);
        const futureAnnual = Number(s.annual_cost_today) * Math.pow(1 + inflRate, yearsUntil);
        const totalCost = futureAnnual * s.years_in_college;
        const r = Number(s.investment_return) / 12;
        const n = yearsUntil * 12;
        const bal = Number(s.current_529_balance);
        const pmt = Number(s.monthly_contribution);
        const fv = n === 0 ? bal : bal * Math.pow(1 + r, n) + (r > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : pmt * n);
        const coverage = totalCost > 0 ? Math.round((fv / totalCost) * 100) : 100;
        const fundingGap = Math.max(0, totalCost - fv);
        const remainder = totalCost - bal * (n > 0 ? Math.pow(1 + r, n) : 1);
        const monthlyNeeded = remainder <= 0 || n === 0 ? 0 : r > 0 ? (remainder * r) / (Math.pow(1 + r, n) - 1) : remainder / n;
        return {
          name: s.name,
          child_name: s.child_name,
          child_current_age: s.child_current_age,
          years_until_college: yearsUntil,
          total_college_cost: Math.round(totalCost),
          fv529: Math.round(fv),
          coverage_pct: coverage,
          funding_gap: Math.round(fundingGap),
          monthly_needed: Math.round(monthlyNeeded),
          monthly_contribution: pmt,
        };
      }),
      family_scenarios: familyScenarios.map((s) => {
        const age = s.child_current_age;
        const currentImpact = age < 3 ? Number(s.monthly_infant_cost) : age <= 12 ? Number(s.monthly_child_cost) : Number(s.monthly_teen_cost);
        let totalCostTo18 = 0;
        for (let a = age; a < 18; a++) {
          totalCostTo18 += (a < 3 ? Number(s.monthly_infant_cost) : a <= 12 ? Number(s.monthly_child_cost) : Number(s.monthly_teen_cost)) * 12;
        }
        return {
          name: s.name,
          child_name: s.child_name,
          child_current_age: age,
          current_monthly_impact: currentImpact,
          total_cost_to_18: Math.round(totalCostTo18),
          monthly_expenses_now: Number(s.monthly_expenses_now),
        };
      }),
      partner_name: profile?.partner_name ?? null,
      partner_age: profile?.partner_age ?? null,
      partner_target_retirement_age: profile?.partner_target_retirement_age ?? null,
      ...(() => {
        if (!estateProfile) return {};
        const wt: Record<string, number> = { doc_will: 20, doc_living_trust: 15, doc_durable_poa: 20, doc_healthcare_directive: 20, doc_beneficiary_desig: 15, doc_digital_assets: 10 };
        const docKeys = Object.keys(wt) as (keyof EstateProfile)[];
        const docsComplete = docKeys.filter((k) => (estateProfile[k] ?? "none") !== "none").length;
        const estScore = docKeys.reduce((s, k) => (estateProfile[k] ?? "none") !== "none" ? s + wt[k as string] : s, 0);
        const estateAssets = balanceItems.filter((i) => !i.is_liability).reduce((s, i) => s + i.value, 0) + portfolioTotalValue;
        const estateLiabs = balanceItems.filter((i) => i.is_liability).reduce((s, i) => s + i.value, 0);
        return {
          estate_score: estScore,
          estate_docs_complete: docsComplete,
          estate_docs_total: docKeys.length,
          estate_value: estateAssets - estateLiabs,
          estate_accounts_count: estateProfile.estate_accounts?.length ?? 0,
          family_instructions_written: !!estateProfile.family_instructions,
        };
      })(),
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
          ? "Introduce yourself as Atlas in one sentence. Then, using my complete financial picture — including all active planning scenarios and their interactions — give me: (1) the single most important cross-planner interaction or timing risk right now, with specific numbers; (2) my highest-leverage action this month; (3) one blind spot I might be missing. End with 2 targeted questions worth exploring."
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

  // Scroll to tab nav when returning from a sub-planner page
  useEffect(() => {
    if (initialTab && initialTab !== "overview") {
      const t = setTimeout(() => {
        document.querySelector(".planning-tabs-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "balance", label: "Balance Sheet" },
    { id: "cashflow", label: "Cash Flow" },
    { id: "forecast", label: "Forecast" },
    { id: "events", label: "Life Events" },
    { id: "estate", label: "Estate Readiness" },
    { id: "finn", label: "Ask Atlas" },
  ];

  function saveAssumptions() {
    const fd = new FormData();
    fd.set("return_rate", String(localAssumptions.return_rate));
    fd.set("inflation_rate", String(localAssumptions.inflation_rate));
    fd.set("salary_growth_rate", String(localAssumptions.salary_growth_rate));
    fd.set("social_security_monthly", String(localAssumptions.social_security_monthly || 0));
    fd.set("social_security_claim_age", String(localAssumptions.social_security_claim_age || ""));
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
    <div className="bt-mobile-nav-pad" style={{ padding: "24px", maxWidth: "900px" }}>

      {showWizard && <OnboardingWizard onClose={() => setShowWizard(false)} profile={profile} />}

      <PageIntro
        pageKey="planning"
        title="Financial Planning"
        description="Map your assets, debts, and income to track net worth, model retirement, and get a financial health score."
      />

      {/* Page header */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "22px", color: "var(--text-primary)", margin: 0 }}>
            Financial Planning
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px", fontFamily: "var(--font-body)" }}>
            Net worth, cash flow, and retirement trajectory.
          </p>
        </div>
        <button
          type="button"
          onClick={togglePrivacy}
          title={isPrivate ? "Show values" : "Hide values"}
          style={{
            display: "flex", alignItems: "center", gap: "5px", flexShrink: 0,
            padding: "6px 12px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)", background: isPrivate ? "var(--bg-surface)" : "transparent",
            color: isPrivate ? "var(--text-primary)" : "var(--text-tertiary)",
            fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {isPrivate ? (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M3.98 8.223A10.477 10.477 0 001.934 10C3.226 13.307 6.4 15.5 10 15.5c.84 0 1.647-.134 2.4-.378m3.62-2.9A10.48 10.48 0 0018.066 10C16.774 6.693 13.6 4.5 10 4.5c-.84 0-1.647.134-2.4.378m-2.75 2.264l9.5 9.5M4.5 4.5l11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" fill="currentColor"/><path d="M1.934 10C3.226 6.693 6.4 4.5 10 4.5s6.774 2.193 8.066 5.5c-1.292 3.307-4.466 5.5-8.066 5.5S3.226 13.307 1.934 10z" stroke="currentColor" strokeWidth="1.5"/></svg>
          )}
          {isPrivate ? "Show" : "Hide"}
        </button>
      </div>

      {/* Net Worth History Chart */}
      <NetWorthHistoryCard
        history={netWorthHistory}
        currentNW={netWorth}
        currentAssets={totalAssets}
        currentLiabilities={totalLiabilities}
        isPrivate={isPrivate}
      />

      {/* Density mode — calm "Guided" vs full-detail "Pro", swappable on every tab */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", margin: "4px 0 12px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "inline-flex", background: "var(--bg-elevated)", borderRadius: "999px", padding: "3px", border: "1px solid var(--border-subtle)" }}>
            {([
              ["guided", "Guided", <path key="g" d="M3 6.5h14M5 10h10M7 13.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />],
              ["pro", "Pro", <path key="p" d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" stroke="currentColor" strokeWidth="1.4" fill="none" />],
            ] as const).map(([key, label, icon]) => (
              <button key={key} type="button" onClick={() => setDensity(key)} aria-pressed={density === key}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 13px", borderRadius: "999px", border: "none", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)", fontWeight: density === key ? 700 : 500,
                  background: density === key ? "var(--brand-blue)" : "transparent", color: density === key ? "#fff" : "var(--text-secondary)", transition: "background 0.15s, color 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">{icon}</svg>{label}
              </button>
            ))}
          </div>
          <InfoTooltip text="Guided shows the big picture and your single next move, with the detail one tap away. Pro opens every number, table, and control. Switch anytime — your choice is remembered." />
        </div>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          {guided ? "Big-picture view — tap any section to see the detail." : "Full detail — every number and control is open."}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <div className="planning-tabs-bar" style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border-subtle)" }}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: "9px 14px", background: "none", border: "none",
                borderBottom: tab === id ? "2px solid var(--brand-blue)" : "2px solid transparent",
                color: tab === id ? "var(--text-primary)" : "var(--text-tertiary)",
                fontSize: "13px", fontWeight: tab === id ? 600 : 400,
                fontFamily: "var(--font-body)", cursor: "pointer",
                transition: "color 0.15s",
                marginBottom: "-1px", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Mobile-only scroll affordance: fade + chevron hinting horizontal swipe */}
        <div className="planning-tabs-fade" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="var(--text-tertiary)">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* ── Tab: Overview ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <style>{`
            @keyframes cmd-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes cmd-bar-in { from { transform: scaleX(0); } }
            @keyframes cmd-ring-draw { from { stroke-dashoffset: 138; } }
            .cmd-section { animation: cmd-fade-up 0.35s ease-out both; }
            .cmd-kpi-tile { transition: background 0.15s, border-color 0.15s; }
            .cmd-kpi-tile:hover { background: var(--bg-elevated) !important; }
            .cmd-health-bar { animation: cmd-bar-in 0.9s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
            .cmd-cta-btn { transition: background 0.15s, border-color 0.15s, color 0.15s; }
            .cmd-cta-btn:hover { background: rgba(37,99,235,0.1) !important; border-color: rgba(37,99,235,0.3) !important; color: var(--text-primary) !important; }
            @media (min-width: 640px) {
              .cmd-kpi-grid { grid-template-columns: repeat(5,1fr) !important; }
              .cmd-kpi-health { grid-column: auto !important; }
              .cmd-body-cols { display: grid !important; grid-template-columns: 3fr 2fr !important; }
            }
          `}</style>

          {/* ── State of your plan: narrative lead (story first, then the numbers) ── */}
          {(() => {
            const hasP = profile?.current_age != null;
            const tone = !hasP || retirementProb == null ? "neutral"
              : retirementProb >= 75 ? "good" : retirementProb >= 50 ? "warn" : "alert";
            const dotColor = tone === "good" ? "var(--green)" : tone === "warn" ? "var(--amber)" : tone === "alert" ? "var(--red)" : "var(--text-tertiary)";
            const ret = profile?.target_retirement_age;
            const sr = savingsRate;
            const srPhrase = sr >= 20 ? `a strong ${sr.toFixed(0)}% savings rate` : sr >= 10 ? `a ${sr.toFixed(0)}% savings rate` : sr > 0 ? `a ${sr.toFixed(0)}% savings rate, with room to grow` : "spending close to your income";
            const readyPhrase = retirementProb == null ? "" : retirementProb >= 80 ? "comfortably on track" : retirementProb >= 60 ? "on track, with a little room to tighten" : retirementProb >= 40 ? "partway there, with a real gap to close" : "early in the journey";
            return (
              <div className="cmd-section" style={{ animationDelay: "0ms", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>State of your plan</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                    {hasP && retirementProb != null && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: dotColor }}>{retirementProb}% on track</span>
                    )}
                    {hasP && (
                      <button type="button" onClick={() => setShowWizard(true)} title="Replay the guided setup and see where you stand"
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "none", border: "none", padding: 0, color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2v3h-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Replay
                      </button>
                    )}
                  </div>
                </div>
                {!hasP ? (
                  <p style={{ fontSize: "15px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.6, maxWidth: "64ch" }}>
                    Set up your basics and BuyTune builds your retirement readiness, a lifetime forecast, and a personalized next move, in under a minute.
                    {" "}<button type="button" onClick={() => setShowWizard(true)} style={{ background: "none", border: "none", padding: 0, color: "var(--brand-blue)", fontFamily: "var(--font-body)", fontSize: "15px", cursor: "pointer", textDecoration: "underline" }}>Start now →</button>
                  </p>
                ) : (
                  <p style={{ fontSize: "15px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.65, maxWidth: "66ch" }}>
                    {readyPhrase && <>You{"'"}re <strong style={{ color: "var(--text-primary)" }}>{readyPhrase}</strong> for retirement{ret ? ` at ${ret}` : ""}. </>}
                    Your <strong style={{ color: "var(--text-primary)" }}>{pHide(fmt(netWorth))}</strong> net worth and {srPhrase} set the pace
                    {drawdown ? (drawdown.success
                      ? <>, and on this path your money lasts through age <strong style={{ color: "var(--text-primary)" }}>{drawdown.endAge}</strong>.</>
                      : <>, though your money runs short around age <strong style={{ color: "var(--amber)" }}>{drawdown.depletedAge}</strong> on the current path.</>)
                      : "."}
                    {lifePlan.nextAction && <> Your highest-leverage move right now: <strong style={{ color: "var(--text-primary)" }}>{lifePlan.nextAction.title.toLowerCase()}</strong>.</>}
                  </p>
                )}
                {hasP && lifePlan.nextAction && (
                  <a href={lifePlan.nextAction.href} style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "13px", padding: "7px 13px", borderRadius: "var(--radius-md)", border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.08)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", textDecoration: "none" }}>
                    {lifePlan.nextAction.title} →
                  </a>
                )}
              </div>
            );
          })()}

          {/* ── Section 1: KPI Strip ── */}
          <div className="cmd-section" style={{ animationDelay: "0ms" }}>
            <div className="cmd-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px" }}>

              <div className="cmd-kpi-tile" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>Net Worth<InfoTooltip align="start" text="Everything you own minus everything you owe — total assets less total liabilities. The single number that captures your overall financial position right now." /></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: netWorth >= 0 ? "var(--green)" : "var(--red)", lineHeight: 1 }}>
                  <CountUp to={Math.abs(netWorth)} prefix={netWorth < 0 ? "-$" : "$"} isPrivate={isPrivate} duration={1100} />
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-body)" }}>{pHide(fmt(totalAssets))} assets</div>
              </div>

              <div className="cmd-kpi-tile" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>Monthly Savings<InfoTooltip align="end" text="What's left over each month: your net monthly income minus your living expenses. This is the money available to invest, save, or pay down debt." /></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: monthlySavings >= 0 ? "var(--green)" : "var(--red)", lineHeight: 1 }}>
                  <CountUp to={Math.abs(monthlySavings)} prefix={monthlySavings < 0 ? "-$" : "$"} isPrivate={isPrivate} duration={1000} />
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-body)" }}>
                  {effectiveIncome > 0 ? `of ${pHide(fmt(effectiveIncome))}/mo` : "Add cash flow items"}
                </div>
              </div>

              <div className="cmd-kpi-tile" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>Savings Rate<InfoTooltip align="start" text="The share of your income you keep each month (monthly savings ÷ income). 20% or more is the common benchmark for steadily building wealth." /></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, lineHeight: 1, color: savingsRate >= 20 ? "var(--green)" : savingsRate >= 10 ? "var(--amber)" : savingsRate > 0 ? "var(--red)" : "var(--text-muted)" }}>
                  {effectiveIncome > 0
                    ? <CountUp to={savingsRate} suffix="%" decimals={1} duration={900} isPrivate={isPrivate} />
                    : <span style={{ fontSize: "15px" }}>—</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-body)" }}>
                  {savingsRate >= 20 ? "Target met" : savingsRate > 0 ? "Target: 20%" : "Add income & expenses"}
                </div>
              </div>

              <div className="cmd-kpi-tile" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>Retirement Probability<InfoTooltip align="end" text="A forward-looking forecast: across thousands of simulated market scenarios (a Monte Carlo simulation) using your age, savings, and target, this is the percentage in which your money lasts through retirement. It predicts the future — unlike the Financial Health Score, which grades your finances today." /></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, lineHeight: 1, color: retirementProb != null ? (retirementProb >= 75 ? "var(--green)" : retirementProb >= 50 ? "var(--amber)" : "var(--red)") : "var(--text-muted)" }}>
                  {retirementProb != null
                    ? <CountUp to={retirementProb} suffix="%" duration={1000} isPrivate={isPrivate} />
                    : <span style={{ fontSize: "15px" }}>—</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-body)" }}>
                  {retirementProb != null ? (retirementProb >= 75 ? "On track" : retirementProb >= 50 ? "Watch closely" : "Needs attention") : "Set retirement age"}
                </div>
              </div>

              {/* Health Score — full-width on mobile, single col on desktop */}
              <div className="cmd-kpi-tile cmd-kpi-health" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 16px", gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ flexShrink: 0, position: "relative", width: "52px", height: "52px" }}>
                  <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="22" stroke="var(--border)" strokeWidth="4" />
                    <circle cx="26" cy="26" r="22"
                      stroke={healthData.total >= 75 ? "oklch(0.72 0.19 145)" : healthData.total >= 50 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)"}
                      strokeWidth="4" strokeLinecap="round" strokeDasharray="138"
                      strokeDashoffset={138 - (healthData.total / 100) * 138}
                      transform="rotate(-90 26 26)"
                      style={{ animation: "cmd-ring-draw 1.2s cubic-bezier(0.22,1,0.36,1) forwards" }}
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {isPrivate ? "•" : healthData.total}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginBottom: "8px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Financial Health Score</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>/100</span>
                    <InfoTooltip align="start" text="A 0–100 grade of your finances as they stand today, blending five areas: cash, liquidity, debt, retirement, and estate. It scores your current standing — unlike Retirement Probability, which forecasts whether your savings will last." />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "6px" }}>
                    {healthData.factors.map((f) => (
                      <div key={f.name}>
                        <div style={{ fontSize: "8px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name.split(" ")[0]}
                        </div>
                        <div style={{ height: "3px", borderRadius: "2px", background: "var(--border)", overflow: "hidden" }}>
                          <div className="cmd-health-bar" style={{ height: "100%", borderRadius: "2px", transform: `scaleX(${f.score / f.max})`, animationDelay: "200ms", background: f.direction === "strength" ? "oklch(0.72 0.19 145)" : f.direction === "neutral" ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Profile Settings ── */}
          {guided && hasPlanProfile && !overviewExpanded && (
            <button type="button" onClick={() => setOverviewExpanded(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "11px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              Show full breakdown
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {overviewAdvanced && (<>
          <div id="profile-settings" className="cmd-section" style={{ animationDelay: "20ms" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Profile Settings</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Age, income, kids, and retirement target</div>
              </div>
              {!editingProfile && (
                <button type="button" onClick={() => setEditingProfile(true)} style={btnSecondaryStyle}>Edit</button>
              )}
            </div>

            {editingProfile ? (
              <form onSubmit={handleProfileSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Date of Birth</label>
                    <input name="date_of_birth" type="date" max={new Date().toISOString().split("T")[0]} defaultValue={profile?.date_of_birth ?? ""} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                  </div>
                  {[
                    { name: "target_retirement_age", label: "Retirement Age", type: "number", default: profile?.target_retirement_age ?? 65 },
                    { name: "monthly_expenses", label: "Monthly Expenses ($)", type: "number", default: profile?.monthly_expenses ?? "" },
                  ].map((f) => (
                    <div key={f.name}>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{f.label}</label>
                      <input name={f.name} type={f.type} min="0" defaultValue={String(f.default)} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{formIncomeType === "retired" ? "Monthly Retirement Income ($)" : "Gross Monthly Income ($)"}</label>
                    <input
                      name="gross_monthly_income"
                      type="number" min="0" step="100"
                      value={formGross || ""}
                      onChange={(e) => setFormGross(Number(e.target.value) || 0)}
                      style={{ ...inputStyle, minWidth: "unset", width: "100%" }}
                    />
                    {formIncomeType === "retired" && (
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Social Security, pension & annuities — before portfolio withdrawals. No payroll tax applied.</div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Risk Tolerance</label>
                    <select name="risk_tolerance" defaultValue={profile?.risk_tolerance ?? "moderate"} style={{ ...selectStyle, width: "100%" }}>
                      <option value="conservative">Conservative</option>
                      <option value="moderate">Moderate</option>
                      <option value="aggressive">Aggressive</option>
                    </select>
                  </div>
                </div>

                {/* Tax Profile */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "14px 0 14px", paddingTop: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px", fontFamily: "var(--font-body)" }}>Tax Profile</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Income Type</label>
                      <select name="income_type" value={formIncomeType} onChange={(e) => setFormIncomeType(e.target.value as IncomeType)} style={{ ...selectStyle, width: "100%" }}>
                        <option value="w2">W-2 Employee</option>
                        <option value="self_employed">Self-Employed / 1099</option>
                        <option value="mixed">W-2 + Freelance</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Filing Status</label>
                      <select name="filing_status" value={formFilingStatus} onChange={(e) => setFormFilingStatus(e.target.value as FilingStatus)} style={{ ...selectStyle, width: "100%" }}>
                        <option value="single">Single</option>
                        <option value="married_filing_jointly">Married Filing Jointly</option>
                        <option value="head_of_household">Head of Household</option>
                        <option value="married_filing_separately">Married Filing Separately</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>State</label>
                      <select name="state_code" value={formStateCode} onChange={(e) => setFormStateCode(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
                        <option value="">— Select state —</option>
                        {US_STATES.map((s) => (
                          <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Pre-Tax Deductions / yr ($)</label>
                      <input
                        name="pre_tax_deductions_annual"
                        type="number" min="0" step="100"
                        value={formPreTax || ""}
                        onChange={(e) => setFormPreTax(Number(e.target.value) || 0)}
                        placeholder="e.g. 23500"
                        style={{ ...inputStyle, minWidth: "unset", width: "100%" }}
                      />
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>{(() => { const cl = contributionLimits(); return `401k (up to ${fmt(cl.k401)}), HSA (${fmt(cl.hsaSelf)}), IRA (${fmt(cl.ira)})`; })()}</div>
                    </div>
                  </div>
                  {formGross > 0 && (() => {
                    const t = estimateTax(formGross, formFilingStatus, formIncomeType, formStateCode, formPreTax);
                    const isSE = formIncomeType === "self_employed" || formIncomeType === "mixed";
                    const computedNet = Math.round(t.netMonthly);
                    return (
                      <div style={{ marginTop: "10px", padding: "10px 12px", background: "oklch(0.55 0.15 265 / 0.06)", border: "1px solid oklch(0.55 0.15 265 / 0.18)", borderRadius: "var(--radius-md)" }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.60 0.15 265)", marginBottom: "7px", fontFamily: "var(--font-body)" }}>Estimated Tax Impact</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "6px" }}>
                          {[
                            { label: "Federal Income Tax", val: fmt(Math.round(t.federalIncomeTax / 12)) + "/mo" },
                            { label: isSE ? "SE Tax" : formIncomeType === "retired" ? "Payroll Tax" : "FICA", val: fmt(Math.round((isSE ? t.seTax : t.ficaTax) / 12)) + "/mo" },
                            { label: `State Tax${formStateCode ? ` (${formStateCode})` : ""}`, val: fmt(Math.round(t.stateTax / 12)) + "/mo" },
                          ].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>{label}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{val}</div>
                            </div>
                          ))}
                          <div>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>
                              Est. Net Monthly
                              {!showNetOverride && (
                                <button type="button" onClick={() => { setShowNetOverride(true); setNetOverride(computedNet); }} style={{ background: "none", border: "none", color: "oklch(0.60 0.15 265)", cursor: "pointer", fontSize: "9px", padding: "0 0 0 5px", fontFamily: "var(--font-body)" }}>override</button>
                              )}
                            </div>
                            {showNetOverride ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <input
                                  type="number" min="0" step="1"
                                  value={netOverride ?? computedNet}
                                  onChange={(e) => setNetOverride(Number(e.target.value) || 0)}
                                  style={{ ...inputStyle, minWidth: "unset", width: "80px", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "3px 6px" }}
                                />
                                <button type="button" onClick={() => { setShowNetOverride(false); setNetOverride(null); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "10px", padding: 0, fontFamily: "var(--font-body)" }}>✕ reset</button>
                              </div>
                            ) : (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--green)" }}>{fmt(computedNet)}</div>
                            )}
                          </div>
                        </div>
                        {formPreTax > 0 && (
                          <div style={{ fontSize: "9px", color: "oklch(0.60 0.15 265)", marginTop: "5px", fontFamily: "var(--font-body)" }}>
                            Pre-tax deductions ({fmt(formPreTax)}/yr) reduce your taxable income by {fmt(Math.round(t.federalMarginalRate * formPreTax))} in federal tax.
                          </div>
                        )}
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "5px", fontFamily: "var(--font-body)" }}>Planning calculations use {showNetOverride && netOverride !== null ? "your override" : "est. net monthly"}. Estimates only — not tax advice.</div>
                      </div>
                    );
                  })()}
                </div>

                {/* Kids */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "16px 0 14px", paddingTop: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px", fontFamily: "var(--font-body)" }}>Children (optional)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {profileKids.map((kid, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="text"
                          placeholder={`Child ${i + 1} name`}
                          value={kid.name}
                          onChange={(e) => setProfileKids((prev) => prev.map((k, j) => j === i ? { ...k, name: e.target.value } : k))}
                          style={{ ...inputStyle, minWidth: "unset", flex: 2 }}
                        />
                        <input
                          type="number"
                          placeholder="Age"
                          min="0"
                          max="25"
                          value={kid.age === 0 ? "" : kid.age}
                          onChange={(e) => setProfileKids((prev) => prev.map((k, j) => j === i ? { ...k, age: Number(e.target.value) || 0 } : k))}
                          style={{ ...inputStyle, minWidth: "unset", flex: 1 }}
                        />
                        {i > 0 && (
                          <button
                            type="button"
                            onClick={() => setProfileKids((prev) => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px", fontSize: "16px", lineHeight: 1, flexShrink: 0 }}
                          >×</button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setProfileKids((prev) => [...prev, { name: "", age: 0 }])}
                      style={{ ...btnSecondaryStyle, alignSelf: "flex-start", fontSize: "11px", padding: "5px 10px" }}
                    >+ Add Child</button>
                  </div>
                </div>

                {/* Partner */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 0 14px", paddingTop: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px", fontFamily: "var(--font-body)" }}>Partner (optional)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Partner Name</label>
                      <input name="partner_name" type="text" placeholder="e.g. Alex" defaultValue={profile?.partner_name ?? ""} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Partner Age</label>
                      <input name="partner_age" type="number" min="18" max="100" placeholder="e.g. 34" defaultValue={profile?.partner_age ?? ""} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Partner Retire At</label>
                      <input name="partner_target_retirement_age" type="number" min="40" max="85" placeholder="e.g. 62" defaultValue={profile?.partner_target_retirement_age ?? ""} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                    </div>
                  </div>
                </div>

                {profileSaveError && (
                  <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: "12px", color: "var(--red)", marginBottom: "8px" }}>
                    {profileSaveError}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button type="submit" disabled={profilePending} style={btnPrimaryStyle}>{profilePending ? "Saving…" : "Save Profile"}</button>
                  {profile && <button type="button" onClick={() => setEditingProfile(false)} style={btnSecondaryStyle}>Cancel</button>}
                </div>
              </form>
            ) : profile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
                  {[
                    { label: "Age", value: profile.current_age ? `${profile.current_age}` : "—" },
                    { label: "Retirement Target", value: profile.target_retirement_age ? String(profile.target_retirement_age) : "—" },
                    { label: "Years Left", value: yearsToRetire != null ? `${yearsToRetire} yrs` : "—" },
                    { label: "Risk Tolerance", value: profile.risk_tolerance ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ ...sectionHeadStyle, marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                  {(profile.gross_monthly_income ?? 0) > 0 && (() => {
                    const t = estimateTax(
                      profile.gross_monthly_income!,
                      (profile.filing_status as FilingStatus) ?? "single",
                      (profile.income_type as IncomeType) ?? "w2",
                      profile.state_code ?? "",
                    );
                    return (
                      <>
                        <div>
                          <div style={{ ...sectionHeadStyle, marginBottom: "2px" }}>{profile.income_type === "retired" ? "Retirement Income" : "Gross Monthly"}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{fmt(profile.gross_monthly_income!)}</div>
                        </div>
                        <div>
                          <div style={{ ...sectionHeadStyle, marginBottom: "2px" }}>
                            {netOverride !== null ? "Net Monthly" : "Est. Net Monthly"}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--green)", fontWeight: 500 }}>
                            {fmt(netOverride !== null ? netOverride : Math.round(t.netMonthly))}
                          </div>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: "1px" }}>
                            {netOverride !== null ? "your override" : `${Math.round(t.federalEffectiveRate * 100 + t.stateEffectiveRate * 100)}% effective total tax`}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {profileKids.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                    <div style={{ ...sectionHeadStyle, marginBottom: "8px" }}>Children</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {profileKids.map((kid, i) => (
                        <span key={i} style={{ fontSize: "11px", fontFamily: "var(--font-body)", padding: "3px 9px", borderRadius: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                          {kid.name || `Child ${i + 1}`}{kid.age > 0 ? `, ${kid.age}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profile.partner_name && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
                    {[
                      { label: "Partner", value: profile.partner_name },
                      { label: "Partner Age", value: profile.partner_age ? String(profile.partner_age) : "—" },
                      { label: "Partner Retires At", value: profile.partner_target_retirement_age ? String(profile.partner_target_retirement_age) : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ ...sectionHeadStyle, marginBottom: "2px" }}>{label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
                Add your profile to unlock your financial health score and retirement forecast.
              </p>
            )}
          </div>

          {/* ── Section 1a-401k: Workplace retirement (401k optimizer) ── */}
          {profile && (
            <div className="cmd-section" style={{ animationDelay: "30ms" }}>
              <Plan401kSection profile={profile} />
            </div>
          )}

          {/* ── Section 1b: Biggest Risk + Biggest Opportunity ── */}
          {commandPriorities.length > 0 && (() => {
            const risk = commandPriorities.find((p) => p.urgent) ?? null;
            const opportunity = commandPriorities.find((p) => !p.urgent) ?? commandPriorities[0];
            const showBoth = risk && opportunity && risk.id !== opportunity.id;
            return (
              <div className="cmd-section" style={{ animationDelay: "40ms", display: "grid", gridTemplateColumns: showBoth ? "1fr 1fr" : "1fr", gap: "10px" }}>
                {/* Risk card */}
                {(showBoth ? risk : (risk ?? null)) && (() => {
                  const r = risk!;
                  return (
                    <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.14)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "oklch(0.65 0.18 25)", fontFamily: "var(--font-body)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                        Biggest Risk
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "5px", lineHeight: 1.3 }}>{r.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5, marginBottom: "10px" }}>{r.why}</div>
                      <button type="button" onClick={() => setTab(r.tabKey as Tab)}
                        style={{ fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)", padding: "4px 12px", borderRadius: "6px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "oklch(0.65 0.18 25)", cursor: "pointer" }}>
                        {r.ctaLabel} →
                      </button>
                    </div>
                  );
                })()}
                {/* Opportunity card */}
                {(showBoth ? opportunity : (!risk ? opportunity : null)) && (() => {
                  const o = opportunity!;
                  return (
                    <div style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "oklch(0.60 0.18 250)", fontFamily: "var(--font-body)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/></svg>
                        Biggest Opportunity
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "5px", lineHeight: 1.3 }}>{o.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5, marginBottom: "8px" }}>{o.why}</div>
                      <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "oklch(0.72 0.19 145)", marginBottom: "8px", fontWeight: 600 }}>↑ {o.impact}</div>
                      <button type="button" onClick={() => setTab(o.tabKey as Tab)}
                        style={{ fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)", padding: "4px 12px", borderRadius: "6px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)", color: "oklch(0.60 0.18 250)", cursor: "pointer" }}>
                        {o.ctaLabel} →
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── Section 2: Priorities + System Health ── */}
          <div className="cmd-section cmd-body-cols" style={{ display: "flex", flexDirection: "column", gap: "14px", animationDelay: "60ms" }}>

            {/* Action Center */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Action Center</div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Ranked by financial impact — act on these first</div>
                </div>
                {commandPriorities.some((p) => p.urgent) && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 9px", borderRadius: "20px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "oklch(0.65 0.18 25)", fontFamily: "var(--font-body)", flexShrink: 0 }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "oklch(0.65 0.18 25)", display: "inline-block" }} />
                    Needs attention
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {commandPriorities.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center" as const }}>
                    <div style={{ fontSize: "22px", marginBottom: "8px" }}>✓</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>All clear</div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Your financial position looks strong across all key areas.</div>
                  </div>
                ) : commandPriorities.map((pri, i) => {
                  const isUrgent = pri.urgent;
                  const isTop = i === 0 && !isUrgent;
                  const bg = isUrgent ? "var(--red-bg)" : isTop ? "var(--nav-active-bg)" : "var(--card-bg)";
                  const borderColor = isUrgent ? "var(--red-border)" : isTop ? "var(--nav-active-border)" : "var(--border-subtle)";
                  const accentColor = isUrgent ? "var(--red)" : isTop ? "var(--brand-blue)" : "oklch(0.72 0.19 145)";
                  const ctaBg = isUrgent ? "rgba(239,68,68,0.1)" : isTop ? "rgba(37,99,235,0.1)" : "rgba(255,255,255,0.05)";
                  const ctaBorder = isUrgent ? "rgba(239,68,68,0.25)" : isTop ? "rgba(37,99,235,0.22)" : "var(--border)";
                  return (
                    <div key={pri.id} style={{ borderRadius: "var(--radius-md)", background: bg, border: `1px solid ${borderColor}`, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        {/* Rank badge */}
                        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingTop: "2px", minWidth: "24px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: accentColor, lineHeight: 1 }}>#{i + 1}</span>
                          {isUrgent && (
                            <span style={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.65 0.18 25)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>URGENT</span>
                          )}
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "4px", lineHeight: 1.3 }}>{pri.title}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.55, marginBottom: "10px" }}>{pri.why}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
                            {/* Impact chip */}
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--green)", fontWeight: 600, background: "rgba(0,211,149,0.08)", border: "1px solid rgba(0,211,149,0.18)" }}>
                              <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M5 9V1M1 5l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              {pri.impact}
                            </div>
                            {/* CTA */}
                            <button type="button" onClick={() => setTab(pri.tabKey as Tab)}
                              style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)", background: ctaBg, border: `1px solid ${ctaBorder}`, color: accentColor, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                              {pri.ctaLabel} →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Health Breakdown — P14 */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "2px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Health Breakdown</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{healthData.total}/100</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "14px" }}>Score by financial domain</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {healthData.factors.map((f, fi) => {
                  const fColor = f.direction === "strength" ? "oklch(0.72 0.19 145)" : f.direction === "neutral" ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)";
                  const barPct = f.score / f.max;
                  return (
                    <div key={f.name}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: fColor, flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{f.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "8px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>{f.score}/{f.max}</span>
                          {f.direction !== "strength" && (
                            <button type="button" onClick={() => setTab(f.tabKey as Tab)}
                              style={{ padding: "2px 7px", borderRadius: "5px", fontSize: "9px", fontWeight: 500, fontFamily: "var(--font-body)", background: "transparent", border: "1px solid var(--border)", color: "var(--text-tertiary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                              Fix →
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ height: "3px", borderRadius: "2px", background: "var(--border)", overflow: "hidden", marginBottom: "3px" }}>
                        <div className="cmd-health-bar" style={{ height: "100%", borderRadius: "2px", background: fColor, transform: `scaleX(${barPct})`, animationDelay: `${200 + fi * 60}ms` }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{f.metric}</span>
                        <span style={{ fontSize: "10px", color: fColor, fontFamily: "var(--font-body)", fontWeight: 500 }}>{f.action}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Section 3: Atlas Insight ── */}
          <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: "var(--radius-lg)", padding: "16px 20px", animationDelay: "100ms" }}>
            <div style={{ display: "flex", gap: "13px", alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, width: "30px", height: "30px", borderRadius: "50%", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/>
                  <path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Atlas's Biggest Insight</div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: "0 0 10px" }}>
                  {finnInsight}
                </p>
                <button type="button" onClick={() => setTab("finn")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "var(--radius-md)", fontSize: "12px", fontWeight: 500, fontFamily: "var(--font-body)", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)", color: "oklch(0.65 0.18 260)", cursor: "pointer" }}>
                  Ask Atlas a question
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Section: Home Purchase Goal ── */}
          {homeScenarios.length > 0 && (() => {
            const hs = homeScenarios[0];
            const loanAmt = hs.purchase_price - hs.down_payment;
            const monthlyRate = hs.mortgage_rate / 100 / 12;
            const totalMonths = hs.loan_term_years * 12;
            const mortgagePmt =
              monthlyRate > 0 && totalMonths > 0
                ? loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
                : totalMonths > 0 ? loanAmt / totalMonths : 0;
            const totalMonthlyCost = mortgagePmt + hs.property_tax_monthly + hs.insurance_monthly + hs.hoa_monthly;
            const monthlyCostDelta = totalMonthlyCost - hs.monthly_rent;
            const dpSaved = Math.min(liquidAssets, hs.down_payment);
            const dpRemaining = Math.max(0, hs.down_payment - liquidAssets);
            const dpProgress = hs.down_payment > 0 ? Math.min(1, liquidAssets / hs.down_payment) : 0;
            const monthsToGoal = monthlySavings > 0 && dpRemaining > 0 ? Math.ceil(dpRemaining / monthlySavings) : null;
            const isReady = dpRemaining <= 0;
            const newSavingsRate = effectiveIncome > 0 ? ((monthlySavings - monthlyCostDelta) / effectiveIncome) * 100 : null;
            return (
              <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "90ms" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                        <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" fill="rgba(99,102,241,0.15)" strokeLinejoin="round"/>
                        <path d="M7 18v-6h6v6" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "1px" }}>Home Purchase Goal</div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{hs.name}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "5px", fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.05em", background: isReady ? "rgba(0,211,149,0.08)" : "rgba(99,102,241,0.1)", color: isReady ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 260)", border: `1px solid ${isReady ? "rgba(0,211,149,0.2)" : "rgba(99,102,241,0.2)"}` }}>
                      {isReady ? "READY" : "GOAL"}
                    </span>
                    <a href="/planning/home" style={{ fontSize: "11px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", textDecoration: "none" }}>
                      View →
                    </a>
                  </div>
                </div>

                {/* Down payment progress bar */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>Down payment savings</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: isReady ? "oklch(0.72 0.19 145)" : "var(--text-primary)" }}>
                      {pHide(`${fmt(dpSaved)} / ${fmt(hs.down_payment)}`)}
                    </span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
                    <div className="cmd-health-bar" style={{ height: "100%", borderRadius: "3px", background: isReady ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 260)", transform: `scaleX(${dpProgress})`, animationDelay: "300ms" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                      {pHide(`${(dpProgress * 100).toFixed(0)}% saved`)}
                    </span>
                    <span style={{ fontSize: "11px", color: isReady ? "oklch(0.72 0.19 145)" : "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                      {isReady
                        ? "Ready to buy"
                        : monthsToGoal !== null
                          ? `${monthsToGoal} mo at current pace`
                          : monthlySavings <= 0
                            ? "Increase savings to project"
                            : "Add cash flow to project"}
                    </span>
                  </div>
                </div>

                {/* 3-column metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Target Price</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {pHide(fmt(hs.purchase_price))}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                      {pHide(`${((hs.down_payment / hs.purchase_price) * 100).toFixed(0)}% down`)}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Monthly Cost</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {pHide(fmt(Math.round(totalMonthlyCost)))}
                    </div>
                    <div style={{ fontSize: "10px", color: monthlyCostDelta > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                      {pHide(`${monthlyCostDelta >= 0 ? "+" : ""}${fmt(Math.round(monthlyCostDelta))} vs rent`)}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Savings After</div>
                    {newSavingsRate !== null ? (
                      <>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: newSavingsRate >= 15 ? "oklch(0.72 0.19 145)" : newSavingsRate >= 5 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)" }}>
                          {pHide(`${Math.max(0, newSavingsRate).toFixed(0)}%`)}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                          {pHide(`vs ${savingsRate.toFixed(0)}% now`)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>—</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Section 4: Future Milestones ── */}
          {(() => {
            const nowYear = new Date().getFullYear();
            const mList: { label: string; year: number; icon: string; color: string }[] = [];
            if (profile?.current_age != null && profile?.target_retirement_age != null) {
              mList.push({ label: `Retire at ${profile.target_retirement_age}`, year: nowYear + Math.max(0, profile.target_retirement_age - profile.current_age), icon: "→", color: "oklch(0.65 0.18 260)" });
            }
            futureEvents.filter((e) => e.event_year >= nowYear).forEach((e) => {
              mList.push({ label: e.label, year: e.event_year, icon: e.amount_impact >= 0 ? "+" : "−", color: e.amount_impact >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" });
            });
            if (homeScenarios.length > 0) mList.push({ label: `Home: ${homeScenarios[0].name}`, year: nowYear + 2, icon: "H", color: "oklch(0.65 0.14 200)" });
            if (familyScenarios.length > 0) mList.push({ label: `Family: ${familyScenarios[0].child_name ?? "child"}`, year: nowYear + 1, icon: "F", color: "oklch(0.72 0.15 340)" });
            const sorted = mList.sort((a, b) => a.year - b.year).slice(0, 6);
            return (
              <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "120ms" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Future Milestones</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Key events on your financial timeline</div>
                  </div>
                  <button type="button" onClick={() => setTab("events")} style={{ fontSize: "11px", fontFamily: "var(--font-body)", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                    View all →
                  </button>
                </div>
                {sorted.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { label: "Set retirement target", tabKey: "overview", hint: "Profile → Retirement Age" },
                      { label: "Model a home purchase", tabKey: "events", hint: "Life Planning → Home" },
                      { label: "Add future financial events", tabKey: "events", hint: "Life Planning → Timeline" },
                    ].map((pl) => (
                      <button key={pl.label} type="button" onClick={() => setTab(pl.tabKey as Tab)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "transparent", border: "1px dashed var(--border)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{pl.label}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{pl.hint} →</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {sorted.map((m, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: i < sorted.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                        <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: `color-mix(in oklch, ${m.color} 15%, transparent)`, border: `1px solid color-mix(in oklch, ${m.color} 30%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, color: m.color }}>
                          {m.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                        <div style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: m.color }}>{m.year}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Section: Financial Independence (P10) ── */}
          {(() => {
            const fiTarget = effectiveExpenses > 0 ? effectiveExpenses * 12 * 25 : 0;
            if (fiTarget <= 0) return null;
            const fiGap = Math.max(0, fiTarget - netWorth);
            const fiProgress = Math.min(1, Math.max(0, netWorth / fiTarget));
            const fiPct = Math.round(fiProgress * 100);
            const fiYearsAway = lifePlan.fiYear != null ? lifePlan.fiYear - currentYear : null;
            const fiAlreadyReached = netWorth >= fiTarget;
            // Boost: how many years earlier if +5pp savings rate?
            const boostMonthly = effectiveIncome > 0 ? effectiveIncome * 0.05 : 0;
            const r = localAssumptions.return_rate / 100;
            let fiYearBoost: number | null = null;
            if (!fiAlreadyReached && boostMonthly > 0) {
              for (let y = 1; y <= 50; y++) {
                const mr = r / 12; const mo = y * 12;
                const fv = mr > 0 ? netWorth * Math.pow(1+mr, mo) + (monthlySavings + boostMonthly) * ((Math.pow(1+mr, mo) - 1) / mr) : netWorth + (monthlySavings + boostMonthly) * mo;
                if (fv >= fiTarget) { fiYearBoost = currentYear + y; break; }
              }
            }
            const speedup = fiYearBoost != null && lifePlan.fiYear != null ? lifePlan.fiYear - fiYearBoost : null;
            const fiColor = fiAlreadyReached ? "var(--green)" : fiPct >= 60 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 260)";
            return (
              <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "125ms" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Financial Independence</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                      {fiAlreadyReached ? "You've reached FI threshold" : `Target: ${pHide(fmt(fiTarget))} (25× annual expenses)`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, color: fiColor, lineHeight: 1 }}>{fiAlreadyReached ? "100%" : `${fiPct}%`}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>of FI target</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden", marginBottom: "16px" }}>
                  <div className="cmd-health-bar" style={{ height: "100%", borderRadius: "3px", background: fiColor, transform: `scaleX(${fiProgress})`, animationDelay: "300ms" }} />
                </div>
                {/* Metrics grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>FI Year</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: fiAlreadyReached ? "var(--green)" : "var(--text-primary)" }}>
                      {fiAlreadyReached ? "Now" : lifePlan.fiYear != null ? String(lifePlan.fiYear) : "60+yr"}
                    </div>
                    {fiYearsAway != null && !fiAlreadyReached && (
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>{fiYearsAway} yrs away</div>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Gap to FI</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: fiAlreadyReached ? "var(--green)" : "var(--text-primary)" }}>
                      {fiAlreadyReached ? "Achieved" : pHide(fmt(fiGap))}
                    </div>
                    {!fiAlreadyReached && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>remaining</div>}
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: speedup != null && speedup > 0 ? "oklch(0.72 0.19 145 / 0.06)" : "var(--card-bg)", border: `1px solid ${speedup != null && speedup > 0 ? "oklch(0.72 0.19 145 / 0.2)" : "var(--border-subtle)"}` }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>+5% Savings Rate</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: speedup != null && speedup > 0 ? "var(--green)" : "var(--text-muted)" }}>
                      {speedup != null && speedup > 0 ? `${speedup} yr${speedup !== 1 ? "s" : ""} earlier` : "—"}
                    </div>
                    {speedup != null && speedup > 0 && <div style={{ fontSize: "10px", color: "oklch(0.72 0.19 145)", marginTop: "2px" }}>fastest lever</div>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Section: Wealth Milestones (P11) ── */}
          {(() => {
            const MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000];
            const fiTarget2 = effectiveExpenses > 0 ? effectiveExpenses * 12 * 25 : 0;
            if (fiTarget2 > 0 && !MILESTONES.includes(Math.round(fiTarget2 / 10000) * 10000)) {
              // Insert FI target at appropriate position
              const insertAt = MILESTONES.findIndex((m) => m > fiTarget2);
              if (insertAt === -1) MILESTONES.push(fiTarget2);
              else MILESTONES.splice(insertAt, 0, fiTarget2);
            }
            const r = localAssumptions.return_rate / 100;
            const mr = r / 12;
            const milestoneRows = MILESTONES.slice(0, 6).map((target) => {
              const isFiTarget = fiTarget2 > 0 && Math.abs(target - fiTarget2) < 5000;
              const achieved = netWorth >= target;
              let projYear: number | null = null;
              if (!achieved && monthlySavings > 0) {
                for (let y = 1; y <= 50; y++) {
                  const mo = y * 12;
                  const fv = mr > 0 ? netWorth * Math.pow(1+mr, mo) + monthlySavings * ((Math.pow(1+mr, mo) - 1) / mr) : netWorth + monthlySavings * mo;
                  if (fv >= target) { projYear = currentYear + y; break; }
                }
              }
              return { target, label: isFiTarget ? `FI Target (${fmt(target)})` : fmt(target), achieved, projYear, isFiTarget };
            });
            const nextMilestone = milestoneRows.find((m) => !m.achieved);
            if (!nextMilestone) return null; // all achieved — skip
            return (
              <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "130ms" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Wealth Milestones</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "14px" }}>
                  {nextMilestone.projYear != null ? `Next: ${pHide(nextMilestone.label)} — projected ${nextMilestone.projYear}` : `Next target: ${pHide(nextMilestone.label)}`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {milestoneRows.map((m) => {
                    const isNext = !m.achieved && milestoneRows.find((r2) => !r2.achieved) === m;
                    const progress = Math.min(1, Math.max(0, netWorth / m.target));
                    const mColor = m.achieved ? "var(--green)" : isNext ? "oklch(0.65 0.18 260)" : "var(--text-muted)";
                    return (
                      <div key={m.target} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "50%", background: m.achieved ? "oklch(0.72 0.19 145 / 0.15)" : isNext ? "oklch(0.65 0.18 260 / 0.12)" : "var(--border)", border: `1px solid ${m.achieved ? "oklch(0.72 0.19 145 / 0.35)" : isNext ? "oklch(0.65 0.18 260 / 0.3)" : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {m.achieved && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="oklch(0.72 0.19 145)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: m.achieved || isNext ? "0" : "0" }}>
                            <span style={{ fontSize: "12px", fontWeight: m.achieved || isNext ? 600 : 400, color: m.achieved ? "var(--text-primary)" : isNext ? "var(--text-primary)" : "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                              {m.isFiTarget ? `FI — ${pHide(fmt(m.target))}` : pHide(m.label)}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: mColor, flexShrink: 0, marginLeft: "8px" }}>
                              {m.achieved ? "Achieved" : m.projYear != null ? String(m.projYear) : "50+ yrs"}
                            </span>
                          </div>
                          {isNext && (
                            <div style={{ height: "3px", borderRadius: "2px", background: "var(--border)", overflow: "hidden", marginTop: "6px" }}>
                              <div className="cmd-health-bar" style={{ height: "100%", borderRadius: "2px", background: "oklch(0.65 0.18 260)", transform: `scaleX(${progress})`, animationDelay: "350ms" }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Section: Financial Momentum (P7 + P8) ── */}
          {(() => {
            if (netWorthHistory.length < 2) return null;
            const sorted = [...netWorthHistory].sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime());
            const oldest = sorted[0];
            const msApart = new Date().getTime() - new Date(oldest.snapshot_date).getTime();
            const daysDiff = msApart / (1000 * 60 * 60 * 24);
            if (daysDiff < 14) return null; // need at least 2 weeks of history
            const monthsDiff = Math.max(1, daysDiff / 30.4);
            const nwChange = netWorth - oldest.net_worth;
            const monthlyBuildRate = nwChange / monthsDiff;
            const assetsChange = totalAssets - oldest.total_assets;
            const liabChange = totalLiabilities - oldest.total_liabilities;
            const isPositive = nwChange >= 0;
            const since12m = sorted.find((s) => {
              const d = (new Date().getTime() - new Date(s.snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
              return d >= 300;
            }) ?? oldest;
            const nwChange12m = netWorth - since12m.net_worth;
            const changeLabel = daysDiff >= 340 ? "12-month gain" : `${Math.round(daysDiff)}-day gain`;
            const changeValue = nwChange12m;
            return (
              <div className="cmd-section" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px", animationDelay: "135ms" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Financial Momentum</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Since {fmtDateShort(oldest.snapshot_date)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: changeValue >= 0 ? "var(--green)" : "var(--red)", lineHeight: 1 }}>
                      {changeValue >= 0 ? "+" : ""}{pHide(fmt(Math.abs(changeValue)))}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{changeLabel}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  {[
                    { label: "Build Rate", value: pHide(`${monthlyBuildRate >= 0 ? "+" : ""}${fmt(Math.round(monthlyBuildRate))}/mo`), color: monthlyBuildRate >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "Assets Change", value: pHide(`${assetsChange >= 0 ? "+" : ""}${fmt(Math.round(assetsChange))}`), color: assetsChange >= 0 ? "var(--text-primary)" : "var(--red)" },
                    { label: "Debt Change", value: pHide(`${liabChange <= 0 ? "" : "+"}${fmt(Math.round(liabChange))}`), color: liabChange <= 0 ? "var(--green)" : "var(--red)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {guided && overviewExpanded && (
            <button type="button" onClick={() => setOverviewExpanded(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "9px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "transparent", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              Show less
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          </>)}

          {/* ── Profile Settings (moved to top, above Biggest Opportunity) — placeholder removed from bottom ── */}

        </div>
      )}

      {/* ── Tab: Balance Sheet ── */}
      {tab === "balance" && (
        <BalanceSheetOS
          balanceItems={balanceItems}
          portfolioTotalValue={portfolioTotalValue}
          portfolioAccounts={portfolioAccounts}
          effectiveExpenses={effectiveExpenses}
          netWorthHistory={netWorthHistory}
          isPrivate={isPrivate}
        />
      )}

      {/* ── Tab: Cash Flow ── */}
      {tab === "cashflow" && (
        <CashFlowOS
          cashFlowItems={cashFlowItems}
          expenseActuals={expenseActuals}
          budgetHistory={budgetHistory}
          effectiveIncome={effectiveIncome}
          monthlyExpenses={monthlyExpenses}
          monthlySavings={monthlySavings}
          savingsRate={savingsRate}
          cashFlowFinnInsight={cashFlowFinnInsight}
          isPrivate={isPrivate}
          guided={guided}
        />
      )}

      {/* ── Tab: Forecast ── */}
      {tab === "forecast" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", ["--card-bg" as string]: "var(--bg-surface)", ["--card-border" as string]: "var(--border-subtle)" }}>

          {/* Confidence Narrative */}
          {retirementPoint && profile?.current_age != null && (
            <div style={{
              background: "rgba(99,102,241,0.04)",
              border: "1px solid rgba(99,102,241,0.22)",
              borderRadius: "var(--radius-lg)", padding: "11px 15px",
            }}>
              <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/><path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "3px" }}>Atlas</div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>
                {(() => {
                  const proj = retirementPoint.baseline;
                  const retAge = activeRetirementAge ?? 65;
                  const prob = retirementProb ?? 0;
                  const topDriver = biggestDrivers[0];
                  let text = pHide(fmt(proj)) + ` projected by age ${retAge} on the baseline scenario.`;
                  if (retirementTarget != null) {
                    text += proj >= retirementTarget
                      ? ` This meets your ${pHide(fmt(retirementTarget))} target.`
                      : ` Your target is ${pHide(fmt(retirementTarget))} — a ${pHide(fmt(retirementTarget - proj))} gap on the current path.`;
                  }
                  if (topDriver?.impact != null && topDriver.impact > 0) {
                    text += ` The highest-leverage action is ${topDriver.label.toLowerCase()}, which adds approximately ${pHide(fmt(topDriver.impact))} to your projected outcome.`;
                  } else if (prob >= 75) {
                    text += ` Your ${prob}% on-track probability is strong — maintain your current trajectory.`;
                  } else if (prob < 55) {
                    text += ` At ${prob}%, the probability of reaching your target is below the 65% threshold — consider increasing savings rate or adjusting retirement age.`;
                  }
                  return text;
                })()}
              </p>
                </div>
              </div>
            </div>
          )}

          {/* What-If Library */}
          {profile?.current_age != null && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <div style={{ ...sectionHeadStyle }}>Life Impact Simulator</div>
                  <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "3px 0 0" }}>Tap a scenario to overlay it on the chart below.</p>
                </div>
                {(whatIfScenario != null || scenarioRetirementAge !== (profile?.target_retirement_age ?? null)) && (
                  <button
                    type="button"
                    onClick={() => { setWhatIfScenario(null); setScenarioRetirementAge(profile?.target_retirement_age ?? null); setLocalAssumptions((prev) => ({ ...prev, return_rate: assumptions?.return_rate ?? 7, inflation_rate: assumptions?.inflation_rate ?? 3, salary_growth_rate: assumptions?.salary_growth_rate ?? 2 })); }}
                    style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontFamily: "var(--font-body)", fontWeight: 500, cursor: "pointer", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >Reset all</button>
                )}
              </div>

              {/* Life event scenarios */}
              {whatIfImpacts && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
                  {([
                    {
                      id: "home" as const,
                      title: "Buy a Home",
                      desc: homeScenarios.length > 0 ? "Based on your home plan" : "Est. 28% of income",
                      impact: whatIfImpacts.home.impact,
                      icon: "🏠",
                    },
                    {
                      id: "child" as const,
                      title: "Have a Child",
                      desc: "+$1,200/mo for 18 yrs",
                      impact: whatIfImpacts.child.impact,
                      icon: "👶",
                    },
                    {
                      id: "career" as const,
                      title: "Career Move +20%",
                      desc: "20% income increase",
                      impact: whatIfImpacts.career.impact,
                      icon: "🚀",
                    },
                  ]).map(({ id, title, desc, impact, icon }) => {
                    const isActive = whatIfScenario === id;
                    const positive = impact != null && impact > 0;
                    const impactColor = impact == null ? "var(--text-muted)"
                      : positive ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)";
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setWhatIfScenario(isActive ? null : id)}
                        style={{
                          background: isActive ? "color-mix(in oklch, oklch(0.75 0.18 70) 8%, var(--bg-elevated))" : "var(--bg-elevated)",
                          border: `1px solid ${isActive ? "oklch(0.75 0.18 70 / 0.4)" : "var(--border)"}`,
                          borderRadius: "var(--radius-md)", padding: "12px 14px",
                          cursor: "pointer", textAlign: "left",
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                      >
                        <div style={{ fontSize: "16px", lineHeight: 1, marginBottom: "6px" }}>{icon}</div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>{title}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "8px" }}>{desc}</div>
                        {impact != null && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: impactColor }}>
                            {positive ? "+" : ""}{fmt(impact)}
                          </div>
                        )}
                        <div style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>at retirement</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Retire/Market chips */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", paddingTop: whatIfImpacts ? "10px" : "0", borderTop: whatIfImpacts ? "1px solid var(--border-subtle)" : "none" }}>
                <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Retire / Market</span>
                {[
                  { label: "Retire 5yr Earlier", action: () => setScenarioRetirementAge(Math.max(profile.current_age! + 1, (activeRetirementAge ?? 65) - 5)) },
                  { label: "Retire 5yr Later",   action: () => setScenarioRetirementAge(Math.min(85, (activeRetirementAge ?? 65) + 5)) },
                  { label: "Market Crash −6%",   action: () => setLocalAssumptions((p) => ({ ...p, return_rate: Math.max(0.5, p.return_rate - 6) })) },
                  { label: "Bull Market +4%",    action: () => setLocalAssumptions((p) => ({ ...p, return_rate: Math.min(20, p.return_rate + 4) })) },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    style={{
                      padding: "4px 10px", borderRadius: "20px", fontSize: "11px",
                      fontFamily: "var(--font-body)", fontWeight: 400, cursor: "pointer",
                      background: "transparent", border: "1px solid var(--border)",
                      color: "var(--text-secondary)", transition: "border-color 0.15s, color 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.65 0.18 270 / 0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
                  >{label}</button>
                ))}
              </div>

              {/* Active scenario banner */}
              {whatIfScenario != null && whatIfImpacts && (() => {
                const s = whatIfImpacts[whatIfScenario];
                const positive = s.impact != null && s.impact > 0;
                const impactColor = s.impact == null ? "var(--text-muted)" : positive ? "var(--green)" : "var(--red)";
                const labels: Record<string, string> = { home: "Buy a Home", child: "Have a Child", career: "Career Move +20%" };
                return (
                  <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1 }}>
                      Scenario: <strong style={{ color: "var(--text-primary)" }}>{labels[whatIfScenario]}</strong> — chart shows the scenario baseline in amber.
                    </span>
                    {s.impact != null && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: impactColor, flexShrink: 0 }}>
                        {positive ? "+" : ""}{fmt(s.impact)}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

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
                        onClick={() => setLocalAssumptions((prev) => ({ ...prev, ...ASSUMPTION_PRESETS[name] }))}
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

              {/* Retirement income — Social Security nets against the readiness target */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "13px", marginBottom: "13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "9px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Retirement Income</span>
                  <InfoTooltip text="Guaranteed income in retirement (Social Security, a pension). We net it against your spending, so your portfolio only has to cover the gap. Enter it in today's dollars; we grow it with inflation to your retirement year. Most simple calculators ignore this and overstate how much you need." />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "10px" }}>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", display: "block", marginBottom: "3px" }}>Social Security ($/mo)</span>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>$</span>
                      <input
                        type="number" inputMode="numeric" min={0} step={50} placeholder="0"
                        value={localAssumptions.social_security_monthly || ""}
                        onChange={(e) => setLocalAssumptions((prev) => ({ ...prev, social_security_monthly: Math.max(0, Number(e.target.value) || 0) }))}
                        style={{ width: "100%", padding: "7px 9px 7px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--input-bg, var(--bg-elevated))", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "13px" }}
                      />
                    </div>
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", display: "block", marginBottom: "3px" }}>Claim age</span>
                    <input
                      type="number" inputMode="numeric" min={62} max={70} step={1} placeholder="67"
                      value={localAssumptions.social_security_claim_age || ""}
                      onChange={(e) => setLocalAssumptions((prev) => ({ ...prev, social_security_claim_age: Math.max(0, Number(e.target.value) || 0) }))}
                      style={{ width: "100%", padding: "7px 9px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--input-bg, var(--bg-elevated))", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "13px" }}
                    />
                  </label>
                </div>
                {/* Live effect on the target */}
                {(() => {
                  if (!retirementPoint) return null;
                  const grossTarget = retirementPoint.annualExpenses * 25;
                  if (annualRetirementIncome > 0 && retirementTarget != null) {
                    const saved = grossTarget - retirementTarget;
                    return (
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "9px 0 0", lineHeight: 1.55 }}>
                        ~<span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(annualRetirementIncome)}</span>/yr of guaranteed income cuts your portfolio target by{" "}
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(saved)}</span> — from {fmt(grossTarget)} to{" "}
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(retirementTarget)}</span>.
                      </p>
                    );
                  }
                  return (
                    <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "9px 0 0", lineHeight: 1.55 }}>
                      Add your estimate to make your target realistic — it can lower the number you need by hundreds of thousands. Find yours at{" "}
                      <a href="https://www.ssa.gov/myaccount/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>ssa.gov</a>.
                    </p>
                  );
                })()}
              </div>

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
                      ? `Monte Carlo: 1,000 simulations with random annual returns (σ=15%). This probability is the share of simulations where your portfolio hits 25× ${annualRetirementIncome > 0 ? "the expenses Social Security doesn't cover" : "annual expenses"} by retirement.`
                      : `The 4% rule: you need 25× your annual expenses saved to retire. ${annualRetirementIncome > 0 ? "Social Security covers part of that spending, so the target is 25× only the gap it leaves. " : ""}At that amount, withdrawing 4% per year should last 30+ years. This probability estimates how close you are to that target.`
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
                  {afterTaxRetirementAssets != null && retirementTaxDrag != null && retirementTaxDrag > 0 && (
                    <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--border-subtle)", fontSize: "9px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.5, display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        after tax
                        <InfoTooltip text={`A tax-deferred dollar (Traditional 401k/IRA) is worth less than a Roth or taxable dollar because withdrawals are taxed as ordinary income. Discounting your tax-deferred balances by an assumed ${Math.round(EFFECTIVE_RETIREMENT_TAX_RATE * 100)}% effective retirement tax rate, your projected ${fmt(retirementPoint.baseline)} is worth about ${fmt(afterTaxRetirementAssets)} of real spending power. This is an estimate and does not change the probability above.`} />
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>≈ {fmt(afterTaxRetirementAssets)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>−{fmt(retirementTaxDrag)} tax</span>
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
                    <linearGradient id="whatifGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb923c" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#fb923c" stopOpacity={0} />
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
                      const scenLabel = whatIfScenario ? { home: "Buy a Home", child: "Have a Child", career: "Career +20%" }[whatIfScenario] : "Scenario";
                      const labels: Record<string, string> = { historical: "Historical", optimistic: "Optimistic", baseline: "Baseline", pessimistic: "Pessimistic", whatif: scenLabel };
                      return [fmt(v), labels[String(name)] ?? String(name)];
                    }}
                  />
                  <Area type="monotone" dataKey="historical" stroke="#00d395" strokeWidth={2} fill="url(#histGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="optimistic" stroke="#00d395" strokeWidth={1} strokeDasharray="4 3" fill="url(#optGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="baseline" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 3" fill="url(#baseGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="pessimistic" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" fill="url(#pessGrad)" dot={false} connectNulls={false} />
                  {whatIfScenario && <Area type="monotone" dataKey="whatif" stroke="#fb923c" strokeWidth={2.5} fill="url(#whatifGrad)" dot={false} connectNulls={false} />}
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
                  ...(whatIfScenario ? [{ color: "#fb923c", label: { home: "Buy a Home", child: "Have a Child", career: "Career +20%" }[whatIfScenario], dashed: false }] : []),
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
              <MetricCard label={`Baseline at ${activeRetirementAge ?? "Retirement"}`} value={pHide(fmt(retirementPoint.baseline))} color="var(--violet)" />
              <MetricCard label="Optimistic scenario" value={pHide(fmt(retirementPoint.optimistic))} color="var(--green)" />
              <MetricCard label="Pessimistic scenario" value={pHide(fmt(retirementPoint.pessimistic))} color="var(--amber)" />
            </div>
          )}

          {/* Retirement Drawdown — the spending phase */}
          {drawdown && activeRetirementAge != null && (() => {
            const retAge = activeRetirementAge;
            const span = Math.max(1, drawdown.endAge - retAge);
            const lastsPct = Math.max(0, Math.min(100, ((drawdown.lastsToAge - retAge) / span) * 100));
            const ok = drawdown.success;
            const longish = !ok && drawdown.lastsToAge >= 85;
            const statusColor = ok ? "var(--green)" : longish ? "var(--amber)" : "var(--red)";
            const headline = ok
              ? `Your money lasts through age ${drawdown.endAge}`
              : `Your money runs short at age ${drawdown.depletedAge}`;
            const sub = ok
              ? `On this plan, ${pHide(fmt(drawdown.startTotal))} of investments at retirement funds your spending (plus Social Security) for life, with about ${pHide(fmt(drawdown.years[drawdown.years.length - 1].total))} left at ${drawdown.endAge}.`
              : `${pHide(fmt(drawdown.startTotal))} of investments at retirement covers your spending until age ${drawdown.lastsToAge}. Closing the gap means saving more, spending less, retiring later, or claiming more guaranteed income.`;
            // Balance sparkline
            const maxBal = Math.max(...drawdown.years.map((y) => y.total), 1);
            const pts = drawdown.years.map((y, i) => {
              const x = (i / Math.max(1, drawdown.years.length - 1)) * 1000;
              const yy = 100 - (y.total / maxBal) * 90 - 5;
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
            }).join(" ");
            const area = `${pts} L1000,100 L0,100 Z`;
            return (
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <span style={sectionHeadStyle}>Retirement Drawdown</span>
                  <InfoTooltip text={`Simulates the spending phase from age ${retAge} to ${drawdown.endAge}. Each year, Social Security covers what it can, required minimum distributions are pulled from tax-deferred accounts at 73+, and the rest is withdrawn tax-smart: taxable, then tax-deferred, then Roth. Taxes use real 2025 federal brackets, the taxable share of Social Security, long-term capital gains tracked against your cost basis${drawdownParams?.stateCode ? `, and ${drawdownParams.stateCode} state income tax` : " (set your state in the profile to include state tax)"}. Contributions grow per account type to retirement. An estimate, not advice.`} />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "17px", fontWeight: 700, color: statusColor }}>{headline}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.55, maxWidth: "640px" }}>{sub}</p>

                {/* Balance-over-retirement sparkline */}
                <svg width="100%" height="64" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ display: "block", marginBottom: "6px" }}>
                  <defs>
                    <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ok ? "#00d395" : "#f59e0b"} stopOpacity="0.20" />
                      <stop offset="100%" stopColor={ok ? "#00d395" : "#f59e0b"} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill="url(#dd-grad)" />
                  <path d={pts} fill="none" stroke={statusColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                </svg>
                {/* Age axis + how-long bar */}
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden", marginBottom: "6px" }}>
                  <div style={{ height: "100%", borderRadius: "3px", background: statusColor, width: `${lastsPct}%` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: "14px" }}>
                  <span>Retire {retAge}</span>
                  <span>{drawdown.success ? `Age ${drawdown.endAge}` : `Depletes ${drawdown.depletedAge}`}</span>
                </div>

                {/* Stat chips */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                  {([
                    { label: "Investments at retirement", val: pHide(fmt(drawdown.startTotal)), color: "var(--text-primary)" },
                    { label: "Lifetime taxes (est.)", val: pHide(fmt(drawdown.totalTaxes)), color: "var(--amber)" },
                    { label: "Lifetime RMDs", val: drawdown.totalRmds > 0 ? pHide(fmt(drawdown.totalRmds)) : "—", color: "var(--text-secondary)" },
                    ...(drawdown.totalConversions > 0 ? [{ label: "Roth converted", val: pHide(fmt(drawdown.totalConversions)), color: "var(--violet)" }] : []),
                    { label: `Left at ${drawdown.endAge}`, val: pHide(fmt(drawdown.years[drawdown.years.length - 1].total)), color: drawdown.success ? "var(--green)" : "var(--red)" },
                  ]).map((s) => (
                    <div key={s.label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "9px 11px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{s.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Options: model real-world levers */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
                  {([
                    { on: modelRothConversions, set: () => setModelRothConversions((v) => !v), label: "Roth conversions" },
                    { on: modelLtc, set: () => setModelLtc((v) => !v), label: "Long-term care" },
                    { on: drawdownMcOn, set: () => setDrawdownMcOn((v) => !v), label: "Monte Carlo" },
                  ]).map((o) => (
                    <button key={o.label} type="button" onClick={o.set}
                      style={{ padding: "5px 11px", borderRadius: "20px", fontSize: "11px", fontFamily: "var(--font-body)", fontWeight: o.on ? 700 : 400, cursor: "pointer",
                        background: o.on ? "var(--brand-blue)" : "transparent", border: `1px solid ${o.on ? "var(--brand-blue)" : "var(--border)"}`, color: o.on ? "#fff" : "var(--text-secondary)", transition: "all 0.15s" }}>
                      {o.label}
                    </button>
                  ))}
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                    Healthcare $/yr
                    <input type="number" inputMode="numeric" min={0} step={1000} placeholder="0"
                      value={healthcareAnnual || ""} onChange={(e) => setHealthcareAnnual(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: "92px", padding: "5px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--input-bg, var(--bg-elevated))", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
                  </label>
                  {/* Conversion bracket target — only relevant when conversions are on */}
                  {modelRothConversions && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                      Fill to
                      <span style={{ display: "inline-flex", gap: "2px", background: "var(--bg-elevated)", borderRadius: "16px", padding: "2px" }}>
                        {(["12", "22"] as const).map((b) => (
                          <button key={b} type="button" onClick={() => setConversionBracket(b)}
                            style={{ padding: "3px 9px", borderRadius: "14px", fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: conversionBracket === b ? 700 : 400, cursor: "pointer", border: "none",
                              background: conversionBracket === b ? "var(--violet)" : "transparent", color: conversionBracket === b ? "#fff" : "var(--text-secondary)" }}>
                            {b}%
                          </button>
                        ))}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>bracket</span>
                    </span>
                  )}
                </div>
                {(healthcareAnnual > 0 || modelLtc) && (
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                    {healthcareAnnual > 0 && `Healthcare adds ${pHide(fmt(healthcareAnnual))}/yr (today's $), growing 5%/yr. `}
                    {modelLtc && "Long-term care models $100k/yr for 3 years starting age 83 (5% inflation)."}
                  </p>
                )}

                {/* Roth conversion comparison (with vs without) */}
                {drawdownAlt && (() => {
                  const withConv = modelRothConversions ? drawdown : drawdownAlt;
                  const withoutConv = modelRothConversions ? drawdownAlt : drawdown;
                  const taxSaved = withoutConv.totalTaxes - withConv.totalTaxes;
                  const endDelta = (withConv.years[withConv.years.length - 1]?.total ?? 0) - (withoutConv.years[withoutConv.years.length - 1]?.total ?? 0);
                  if (Math.abs(taxSaved) < 2000 && Math.abs(endDelta) < 2000) return null;
                  const helps = taxSaved > 0 || endDelta > 0;
                  return (
                    <div style={{ marginTop: "12px", padding: "11px 13px", borderRadius: "var(--radius-md)", background: "color-mix(in oklch, var(--violet) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--violet) 24%, transparent)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--violet)", fontFamily: "var(--font-body)" }}>Roth Conversion Strategy</span>
                        <InfoTooltip text={'Converting tax-deferred savings to Roth in low-income years before age 73 fills up the 12% bracket, pays tax now at a low rate, shrinks future RMDs, and leaves tax-free money for later. Toggle "Roth conversions" to apply it to the plan above.'} />
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                        {modelRothConversions ? "With conversions on, " : "Modeling Roth conversions could "}
                        {helps ? (
                          <>
                            {taxSaved > 0 && <>{modelRothConversions ? "you cut" : "cut"} lifetime taxes by <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{pHide(fmt(Math.abs(taxSaved)))}</span></>}
                            {taxSaved > 0 && endDelta > 0 && " and "}
                            {endDelta > 0 && <>{taxSaved > 0 ? "leave" : (modelRothConversions ? "leaves" : "leave")} <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{pHide(fmt(Math.abs(endDelta)))}</span> more at {drawdown.endAge}</>}
                            {". "}
                            {(withoutConv.totalRmds - withConv.totalRmds) > 2000 && <>It also trims lifetime RMDs by {pHide(fmt(withoutConv.totalRmds - withConv.totalRmds))}.</>}
                          </>
                        ) : (
                          <>conversions don&apos;t help much on this plan — your tax-deferred balance or income mix is already efficient.</>
                        )}
                      </p>
                    </div>
                  );
                })()}

                {/* Monte Carlo on the drawdown */}
                {drawdownMcOn && drawdownMc && (
                  <div style={{ marginTop: "12px", padding: "12px 13px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Monte Carlo · 400 runs</span>
                      <InfoTooltip text="Runs the same drawdown 400 times with random annual returns (σ=15%). Success means your money never runs out before age 95 — a far stronger test than hitting 25× expenses at retirement." />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px" }}>
                      {([
                        { label: "Plan succeeds", val: `${drawdownMc.successRate}%`, color: drawdownMc.successRate >= 80 ? "var(--green)" : drawdownMc.successRate >= 60 ? "var(--amber)" : "var(--red)" },
                        { label: `Median left at ${drawdown.endAge}`, val: pHide(fmt(drawdownMc.medianEndBalance)), color: "var(--text-primary)" },
                        { label: `Poor markets (10th %ile)`, val: pHide(fmt(drawdownMc.p10EndBalance)), color: drawdownMc.p10EndBalance > 0 ? "var(--text-secondary)" : "var(--red)" },
                        ...(drawdownMc.medianDepletionAge != null ? [{ label: "If short, median age", val: `${drawdownMc.medianDepletionAge}`, color: "var(--amber)" }] : []),
                      ]).map((s) => (
                        <div key={s.label}>
                          <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{s.label}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {guided && !forecastExpanded && (
            <button type="button" onClick={() => setForecastExpanded(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "11px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              Show full forecast detail
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {forecastAdvanced && (<>
          {/* Biggest Drivers */}
          {biggestDrivers.length > 0 && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px" }}>
              <div style={{ ...sectionHeadStyle, marginBottom: "14px" }}>Biggest Drivers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {biggestDrivers.map((driver, i) => {
                  const hasImpact = driver.impact !== null;
                  const positive = hasImpact && driver.impact! > 0;
                  const impactColor = positive ? "var(--green)" : "var(--red)";
                  return (
                    <div key={driver.label} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 12px", borderRadius: "var(--radius-md)",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", width: "16px", flexShrink: 0, textAlign: "right" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{driver.label}</span>
                      {hasImpact ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: impactColor, flexShrink: 0 }}>
                          {positive ? "+" : ""}{pHide(fmt(driver.impact!))}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px",
                          background: driver.type === "modeled" ? "rgba(0,211,149,0.1)" : "rgba(255,255,255,0.05)",
                          color: driver.type === "modeled" ? "var(--green)" : "var(--text-muted)",
                          fontFamily: "var(--font-body)", flexShrink: 0,
                        }}>
                          {driver.type === "modeled" ? "Modeled" : "Not modeled"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "12px 0 0", lineHeight: 1.5 }}>
                Impact amounts show the change to projected net worth at retirement vs. your baseline scenario.
              </p>
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

          {/* Scenario Comparison */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "24px" }}>
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>Scenario Comparison</div>
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 16px" }}>Dial retirement age, savings, and return rate to compare two paths side by side.</p>
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
          </div>
          {guided && forecastExpanded && (
            <button type="button" onClick={() => setForecastExpanded(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "9px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "transparent", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              Show less
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          </>)}
        </div>
      )}

      {/* ── Tab: My Life Plan ── */}
      {tab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", ["--card-bg" as string]: "var(--bg-surface)", ["--card-border" as string]: "var(--border-subtle)" }}>

          <style>{`
            @keyframes hub-ring-draw { from { stroke-dashoffset: 226; } }
            @keyframes hub-bar-scale { from { transform: scaleX(0); } }
            @keyframes hub-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .hub-card { transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease; }
            .hub-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px oklch(0 0 0 / 0.25); }
            .hub-card-home:hover { border-color: oklch(0.65 0.14 200 / 0.4) !important; }
            .hub-card-family:hover { border-color: oklch(0.72 0.15 340 / 0.4) !important; }
            .hub-card-career:hover { border-color: oklch(0.75 0.16 55 / 0.4) !important; }
            .hub-card-edu:hover { border-color: oklch(0.65 0.18 260 / 0.4) !important; }
            .hub-card-sabbatical:hover { border-color: oklch(0.72 0.19 145 / 0.4) !important; }
            .hub-card-car:hover { border-color: oklch(0.72 0.20 38 / 0.4) !important; }
            .hub-card-apartment:hover { border-color: oklch(0.68 0.16 280 / 0.4) !important; }
            .hub-ring-fill { animation: hub-ring-draw 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
            .hub-bar-fill { animation: hub-bar-scale 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards; transform-origin: left; }
            .hub-section { animation: hub-fade-up 0.35s ease-out both; }
            .hub-divider-label { display: flex; align-items: center; gap: 10px; }
            .hub-divider-label::before, .hub-divider-label::after { content: ""; flex: 1; height: 1px; background: var(--border-subtle); }
            @media (max-width: 640px) {
              .hub-decisions-grid { grid-template-columns: 1fr !important; }
              .hub-verdict-grid { grid-template-columns: 1fr !important; }
              .hub-verdict-ring { display: none !important; }
              .hub-verdict-stats { padding: 12px 24px 20px !important; flex-direction: row !important; flex-wrap: wrap !important; gap: 16px !important; }
              .hub-verdict-stats > div { min-width: 120px; flex: 1; }
            }
          `}</style>

          {/* Atlas Life Verdict */}
          <div className="hub-section" style={{
            borderRadius: "var(--radius-xl)",
            border: lifePlan.futureReadinessScore >= 75
              ? "1px solid color-mix(in oklch, var(--green) 20%, var(--border))"
              : lifePlan.futureReadinessScore >= 50
              ? "1px solid color-mix(in oklch, oklch(0.78 0.17 70) 22%, var(--border))"
              : "1px solid color-mix(in oklch, var(--red) 22%, var(--border))",
            background: lifePlan.futureReadinessScore >= 75
              ? "color-mix(in oklch, var(--green) 4%, var(--bg-card))"
              : lifePlan.futureReadinessScore >= 50
              ? "color-mix(in oklch, oklch(0.78 0.17 70) 4%, var(--bg-card))"
              : "color-mix(in oklch, var(--red) 4%, var(--bg-card))",
            overflow: "hidden",
          }}>
            <div style={{ padding: "18px 24px 0", display: "flex", alignItems: "center", gap: "9px", marginBottom: "14px" }}>
              <div style={{ flexShrink: 0, width: "22px", height: "22px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="9" height="9" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/><path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase" }}>Atlas</span>
              <div style={{ width: "1px", height: "10px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>Life Plan Verdict</span>
            </div>
            <div className="hub-verdict-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto 200px", gap: "0", paddingBottom: "20px" }}>
              <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "10px" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "21px", color: "var(--text-primary)", lineHeight: 1.2 }}>
                  {lifePlan.futureReadinessScore >= 75 ? "Your plan is well-positioned" : lifePlan.futureReadinessScore >= 60 ? "Solid foundation, a few gaps to close" : lifePlan.futureReadinessScore >= 40 ? "Your plan has gaps that compound over time" : "Your financial plan needs urgent attention"}
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.6, maxWidth: "420px" }}>
                  {lifePlan.nextAction
                    ? lifePlan.nextAction.description
                    : lifePlan.futureReadinessScore >= 75
                    ? `Your plan covers ${[homeScenarios, familyScenarios, careerScenarios, educationScenarios].filter(a => a.length > 0).length} planning areas with no critical conflicts. Keep monitoring annually.`
                    : "Add scenarios to the planners below to model how your major life decisions affect each other and your retirement outcome."}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxWidth: "320px" }}>
                  {[
                    { label: "Retirement", pts: lifePlan.scoreBreakdown.retirementPts, max: 50 },
                    { label: "Health", pts: lifePlan.scoreBreakdown.healthPts, max: 30 },
                    { label: "Planning", pts: lifePlan.scoreBreakdown.planningPts, max: 20 },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", width: "58px", flexShrink: 0 }}>{row.label}</span>
                      <div style={{ flex: 1, height: "3px", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                        <div className="hub-bar-fill" style={{ width: "100%", height: "100%", borderRadius: "2px",
                          background: (() => { const pct = row.max > 0 ? row.pts / row.max : 0; return pct >= 0.7 ? "var(--green)" : pct >= 0.4 ? "oklch(0.78 0.17 70)" : "var(--red)"; })(),
                          transform: `scaleX(${row.max > 0 ? row.pts / row.max : 0})`, transformOrigin: "0 50%" }} />
                      </div>
                      <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", width: "32px", textAlign: "right", flexShrink: 0 }}>{row.pts}/{row.max}</span>
                    </div>
                  ))}
                </div>
                {lifePlan.scoreDeductions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {lifePlan.scoreDeductions.map((d, i) =>
                      d.href ? (
                        <Link key={i} href={d.href} style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-secondary)", background: "color-mix(in oklch, var(--red) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--red) 18%, transparent)", padding: "2px 7px", borderRadius: "20px", textDecoration: "none", cursor: "pointer" }}>
                          {d.label} ({d.points > 0 ? "-" : ""}{Math.abs(d.points)})
                        </Link>
                      ) : (
                        <span key={i} style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-secondary)", background: "color-mix(in oklch, var(--red) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--red) 18%, transparent)", padding: "2px 7px", borderRadius: "20px" }}>
                          {d.label} ({d.points > 0 ? "-" : ""}{Math.abs(d.points)})
                        </span>
                      )
                    )}
                  </div>
                )}
                {lifePlan.nextAction && (
                  <div>
                    <Link href={lifePlan.nextAction.href} style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "8px 16px", borderRadius: "var(--radius-md)",
                      background: lifePlan.nextAction.priority === "high" ? "var(--red)" : "var(--accent)",
                      color: "#fff", fontSize: "12px", fontFamily: "var(--font-body)", fontWeight: 600, textDecoration: "none",
                    }}>
                      {lifePlan.nextAction.title}
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </Link>
                  </div>
                )}
              </div>
              <div className="hub-verdict-ring" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", borderLeft: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)" }}>
                <div style={{ position: "relative", width: "88px", height: "88px", flexShrink: 0 }}>
                  <svg width="88" height="88" viewBox="0 0 88 88" style={{ display: "block" }}>
                    <circle cx="44" cy="44" r="36" fill="none" stroke="var(--border-subtle)" strokeWidth="5" />
                    <circle cx="44" cy="44" r="36" fill="none"
                      stroke={lifePlan.futureReadinessScore >= 75 ? "var(--green)" : lifePlan.futureReadinessScore >= 50 ? "oklch(0.78 0.17 70)" : "var(--red)"}
                      strokeWidth="5" strokeLinecap="round" strokeDasharray="226"
                      strokeDashoffset={226 - (lifePlan.futureReadinessScore / 100) * 226}
                      transform="rotate(-90 44 44)" className="hub-ring-fill"
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "20px", color: "var(--text-primary)", lineHeight: 1 }}>{lifePlan.futureReadinessScore}</span>
                    <span style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>/100</span>
                  </div>
                </div>
              </div>
              <div className="hub-verdict-stats" style={{ padding: "0 24px 0 0", display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
                {lifePlan.projectedNWAtRetirement != null && (
                  <div>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "3px" }}>At Retirement</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: "var(--green)", lineHeight: 1 }}>{fmt(Math.round(lifePlan.projectedNWAtRetirement))}</div>
                  </div>
                )}
                {retirementProb != null && (
                  <div>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "3px" }}>Retirement Probability</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: retirementProb >= 80 ? "var(--green)" : retirementProb >= 60 ? "oklch(0.78 0.17 70)" : "var(--red)", lineHeight: 1 }}>{Math.round(retirementProb)}%</div>
                  </div>
                )}
                {lifePlan.biggestDecisions[0] && (
                  <div>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "3px" }}>Largest Decision</div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.2 }}>{lifePlan.biggestDecisions[0].label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: lifePlan.biggestDecisions[0].positive ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                      {lifePlan.biggestDecisions[0].positive ? "+" : ""}{fmt(Math.abs(lifePlan.biggestDecisions[0].impact))} lifetime
                    </div>
                  </div>
                )}
                {lifePlan.projectedNWAtRetirement == null && retirementProb == null && !lifePlan.biggestDecisions[0] && (
                  <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>Add your age in Profile to unlock retirement projections.</p>
                )}
              </div>
            </div>
          </div>

          {/* Conflict Alerts — elevated directly after verdict */}
          {lifePlan.conflictAlerts.length > 0 && (
            <div className="hub-section" style={{ animationDelay: "0.06s", display: "flex", flexDirection: "column", gap: "7px" }}>
              <div className="hub-divider-label" style={{ marginBottom: "4px" }}>
                <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--red)", fontFamily: "var(--font-body)" }}>Conflicts Detected</span>
              </div>
              {lifePlan.conflictAlerts.map((alert, i) => {
                const sev = alert.severity;
                const color = sev === "critical" ? "var(--red)" : sev === "warning" ? "oklch(0.78 0.17 70)" : "var(--accent)";
                const firstYear = alert.years.length > 0 ? alert.years[0] : null;
                const lastYear = alert.years.length > 1 ? alert.years[alert.years.length - 1] : null;
                return (
                  <div key={i} style={{ borderRadius: "var(--radius-md)", border: `1px solid color-mix(in oklch, ${color} 22%, var(--border))`, background: `color-mix(in oklch, ${color} 5%, var(--bg-card))`, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, background: `color-mix(in oklch, ${color} 12%, transparent)`, padding: "2px 7px", borderRadius: "20px" }}>{sev}</span>
                      {firstYear != null && (
                        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginLeft: "auto" }}>
                          {firstYear}{lastYear != null ? `–${lastYear}` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "5px", lineHeight: 1.3 }}>{alert.title}</div>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 8px", lineHeight: 1.55 }}>{alert.description}</p>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 600, color }}>Fix: </span>{alert.recommendation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Master Life Roadmap (P-Spine-2 + P-Spine-3 conflict zones) */}
          <div className="hub-section" style={{ animationDelay: "0.07s" }}>
            <MasterLifeRoadmap
              startYear={roadmap.startYear}
              endYear={roadmap.endYear}
              events={roadmap.events}
              milestones={roadmap.milestones}
              trajectory={roadmap.trajectory}
              conflictZones={lifePlan.conflictAlerts
                .filter((a) => a.years.length > 0)
                .map((a) => ({
                  startYear: Math.min(...a.years),
                  endYear: Math.max(...a.years) + (a.years.length === 1 ? 1 : 0),
                  severity: a.severity,
                  label: a.title,
                }))}
            />
          </div>

          {/* Life Decisions divider */}
          <div className="hub-section hub-divider-label" style={{ animationDelay: "0.08s" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Life Decisions</span>
          </div>

          {/* Planner Cards */}
          <div className="hub-section" style={{ animationDelay: "0.1s" }}>
            <style>{`.hub-decisions-grid.hub-collapsed .hub-card:not(.hub-primary){display:none}`}</style>
            <div className={`hub-decisions-grid${guided && !hubExpanded ? " hub-collapsed" : ""}`} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>

              <Link href="/planning/home" className="hub-card hub-primary hub-card-home" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.65 0.14 200) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.65 0.14 200)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M7 18V12h6v6"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Home</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--red)", background: "color-mix(in oklch, var(--red) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>HIGH</span>
                    {(() => { const st = lifePlan.plannerHealth.home; const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)"; const l = st === "strong" ? "On track" : st === "alert" ? "At risk" : st === "review" ? "Review" : "Not started"; return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>; })()}
                  </div>
                </div>
                {lifePlan.homeMetrics ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>vs. Renting</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: lifePlan.homeMetrics.monthlyDelta >= 0 ? "var(--red)" : "var(--green)" }}>
                        {lifePlan.homeMetrics.monthlyDelta >= 0 ? "+" : ""}{fmt(lifePlan.homeMetrics.monthlyDelta)}/mo
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Retirement Impact</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--red)" }}>{fmt(lifePlan.homeMetrics.retirImpact)}</div>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Buying vs. renting reshapes your retirement by $200K–$500K.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/family" className="hub-card hub-primary hub-card-family" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.15 340) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.15 340)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="6" r="3"/><circle cx="13" cy="6" r="3"/><path d="M1 18c0-3.31 2.69-6 6-6s6 2.69 6 6" strokeLinecap="round"/><path d="M13 12a5 5 0 0 1 4 4.9" strokeLinecap="round"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Family</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--red)", background: "color-mix(in oklch, var(--red) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>HIGH</span>
                    {(() => { const st = lifePlan.plannerHealth.family; const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)"; const l = st === "strong" ? "On track" : st === "alert" ? "At risk" : st === "review" ? "Review" : "Not started"; return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>; })()}
                  </div>
                </div>
                {lifePlan.familyMetrics ? (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Lifetime Cost Remaining</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--red)" }}>{fmt(lifePlan.familyMetrics.lifetimeCost)}</div>
                    {lifePlan.familyMetrics.count > 1 && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>{lifePlan.familyMetrics.count} children modeled</div>}
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Model child costs to see the retirement trade-off.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/career" className="hub-card hub-primary hub-card-career" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.75 0.16 55) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.75 0.16 55)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="16" height="10" rx="1"/><path d="M7 7V5a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Career</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.75 0.16 55)", background: "color-mix(in oklch, oklch(0.75 0.16 55) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>MEDIUM</span>
                    {(() => { const st = lifePlan.plannerHealth.career; const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)"; const l = st === "strong" ? "Opportunity" : st === "alert" ? "At risk" : st === "review" ? "Review" : "Not started"; return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>; })()}
                  </div>
                </div>
                {lifePlan.careerMetrics ? (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Lifetime Income Impact</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: lifePlan.careerMetrics.isPositive ? "var(--green)" : "var(--red)" }}>
                      {lifePlan.careerMetrics.isPositive ? "+" : ""}{fmt(lifePlan.careerMetrics.lifetimeGain)}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lifePlan.careerMetrics.name}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>A career move can add $500K–$1M in lifetime income.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/education" className="hub-card hub-card-edu" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.65 0.18 260) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.65 0.18 260)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 2L2 7l8 5 8-5-8-5z"/><path d="M2 7v6M18 7v6M6 9.5v4a4 4 0 008 0v-4" strokeLinecap="round"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Education / 529</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: lifePlan.educationMetrics && lifePlan.educationMetrics.gap > 0 ? "var(--red)" : "oklch(0.65 0.18 260)", background: lifePlan.educationMetrics && lifePlan.educationMetrics.gap > 0 ? "color-mix(in oklch, var(--red) 12%, transparent)" : "color-mix(in oklch, oklch(0.65 0.18 260) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>
                      {lifePlan.educationMetrics && lifePlan.educationMetrics.gap > 0 ? "HIGH" : "MEDIUM"}
                    </span>
                    {(() => { const st = lifePlan.plannerHealth.education; const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)"; const l = st === "strong" ? "On track" : st === "alert" ? "Underfunded" : st === "review" ? "Review" : "Not started"; return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>; })()}
                  </div>
                </div>
                {lifePlan.educationMetrics ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Coverage</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: lifePlan.educationMetrics.coverage >= 80 ? "var(--green)" : lifePlan.educationMetrics.coverage >= 50 ? "oklch(0.78 0.17 70)" : "var(--red)" }}>
                        {lifePlan.educationMetrics.coverage}%
                      </div>
                    </div>
                    {lifePlan.educationMetrics.gap > 0 && (
                      <div>
                        <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Funding Gap</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--red)" }}>{fmt(lifePlan.educationMetrics.gap)}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Project 529 growth against college costs.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/sabbatical" className="hub-card hub-card-sabbatical" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.19 145) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.19 145)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" strokeLinecap="round"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" strokeLinecap="round"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Time Off</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.19 145)", background: "color-mix(in oklch, oklch(0.72 0.19 145) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>LIFE</span>
                    {(() => {
                      const st = lifePlan.plannerHealth.sabbatical;
                      const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)";
                      const l = st === "strong" ? "Funded" : st === "alert" ? "Save more" : st === "review" ? "Plan ahead" : "Not started";
                      return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>;
                    })()}
                  </div>
                </div>
                {lifePlan.sabbaticalMetrics ? (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>
                      {lifePlan.sabbaticalMetrics.verdict === "GO" || lifePlan.sabbaticalMetrics.verdict === "PLAN" || lifePlan.sabbaticalMetrics.verdict === "NOT_YET" ? "Runway vs. Needed" : "Trip Cost"}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: (lifePlan.sabbaticalMetrics.verdict === "GO" || lifePlan.sabbaticalMetrics.verdict === "BOOK_IT") ? "var(--green)" : (lifePlan.sabbaticalMetrics.verdict === "PLAN" || lifePlan.sabbaticalMetrics.verdict === "SAVE_MORE") ? "oklch(0.78 0.17 70)" : "var(--red)" }}>
                      {lifePlan.sabbaticalMetrics.runwayMonths > 99 ? "∞" : `${Math.round(lifePlan.sabbaticalMetrics.runwayMonths)} mo`} of {lifePlan.sabbaticalMetrics.sabbaticalMonths} needed
                    </div>
                    {lifePlan.sabbaticalMetrics.recoveryMonths != null && (
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
                        {lifePlan.sabbaticalMetrics.recoveryMonths} mo recovery
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Plan a vacation or career break — see what it costs and when you&apos;d recover.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/car" className="hub-card hub-card-car" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.20 38) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.20 38)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
                    </div>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>Car Purchase</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.20 38)", background: "color-mix(in oklch, oklch(0.72 0.20 38) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>LIFE</span>
                    {(() => {
                      const st = lifePlan.plannerHealth.car;
                      const c = st === "strong" ? "var(--green)" : st === "alert" ? "var(--red)" : st === "review" ? "oklch(0.78 0.17 70)" : "var(--text-tertiary)";
                      const l = st === "strong" ? "Good deal" : st === "alert" ? "High cost" : st === "review" ? "Review" : "Not started";
                      return <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: c }}>{l}</span>;
                    })()}
                  </div>
                </div>
                {lifePlan.carMetrics ? (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Monthly Cost Change</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: lifePlan.carMetrics.moDelta <= 0 ? "var(--green)" : lifePlan.carMetrics.moDeltaPct <= 10 ? "oklch(0.78 0.17 70)" : "var(--red)" }}>
                      {lifePlan.carMetrics.moDelta >= 0 ? "+" : ""}{fmt(Math.round(lifePlan.carMetrics.moDelta))}/mo
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lifePlan.carMetrics.name}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Compare your current car to a new one — payments, TCO, trade-in, break-even.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              <Link href="/planning/apartment" className="hub-card hub-card-apartment" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.68 0.16 280) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.68 0.16 280)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="8" width="14" height="10" rx="1"/><path d="M1 8l9-6 9 6" strokeLinecap="round" strokeLinejoin="round"/><rect x="7" y="12" width="6" height="6" rx="0.5"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Apartment</span>
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", fontFamily: "var(--font-body)",
                    color: apartmentListings.length === 0 ? "var(--text-muted)" : "oklch(0.68 0.16 280)",
                    background: apartmentListings.length === 0 ? "rgba(255,255,255,0.04)" : "color-mix(in oklch, oklch(0.68 0.16 280) 12%, transparent)" }}>
                    {apartmentListings.length === 0 ? "Not Started" : `${apartmentListings.length} listing${apartmentListings.length !== 1 ? "s" : ""}`}
                  </span>
                </div>
                {apartmentListings.length > 0 ? (() => {
                  const cheapest = [...apartmentListings].sort((a, b) => {
                    const ta = Math.max(0, a.base_rent - a.concession_monthly_savings) + (a.has_pets ? a.pet_rent_monthly * a.pet_count : 0) + a.parking_monthly;
                    const tb = Math.max(0, b.base_rent - b.concession_monthly_savings) + (b.has_pets ? b.pet_rent_monthly * b.pet_count : 0) + b.parking_monthly;
                    return ta - tb;
                  })[0];
                  const trueMonthly = Math.max(0, cheapest.base_rent - cheapest.concession_monthly_savings) + (cheapest.has_pets ? cheapest.pet_rent_monthly * cheapest.pet_count : 0) + cheapest.parking_monthly;
                  return (
                    <div style={{ marginBottom: "10px" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 3px", fontFamily: "var(--font-body)" }}>Best effective rent</p>
                      <p style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", margin: 0 }}>
                        {"$" + Math.round(trueMonthly).toLocaleString("en-US") + "/mo"}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "2px 0 0", fontFamily: "var(--font-body)" }}>{cheapest.name}</p>
                    </div>
                  );
                })() : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Compare apartments with AI concession parsing, true monthly cost, and rent burden analysis.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Debt Payoff — only a relevant/health-affecting planner when the user actually has liabilities */}
              <Link href="/planning/debt" className="hub-card hub-card-debt" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.70 0.19 25) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.70 0.19 25)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7l9-4 9 4M4 7v10a1 1 0 001 1h14a1 1 0 001-1V7M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Debt Payoff</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.70 0.19 25)", background: "color-mix(in oklch, oklch(0.70 0.19 25) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>MONEY</span>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: totalLiabilities > 0 ? "oklch(0.78 0.17 70)" : "var(--green)" }}>
                      {totalLiabilities > 0 ? "Plan payoff" : "Debt-free"}
                    </span>
                  </div>
                </div>
                {totalLiabilities > 0 ? (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", marginBottom: "2px" }}>Total Liabilities</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(Math.round(totalLiabilities))}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>Avalanche vs. snowball — payoff date & interest saved</div>
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>No liabilities on your balance sheet — you&apos;re debt-free. Add debts there to model a payoff plan.</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Windfall */}
              <Link href="/planning/windfall" className="hub-card hub-card-windfall" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.19 145) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.19 145)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Windfall</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.19 145)", background: "color-mix(in oklch, oklch(0.72 0.19 145) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>MONEY</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Got a bonus or inheritance? See the optimal split across debt, emergency fund, and investing.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Wedding */}
              <Link href="/planning/wedding" className="hub-card hub-card-wedding" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.15 340) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.15 340)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 6 6 6c2 0 3.5 1.5 4 2.5C10.5 7.5 12 6 14 6c-.5 0-1 .1-1.4.3M16 3l4 4-7 7-4-4 7-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Wedding</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.15 340)", background: "color-mix(in oklch, oklch(0.72 0.15 340) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>LIFE</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Budget by guest count, see the monthly savings to hit your date, and where the money goes.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Relocation */}
              <Link href="/planning/relocation" className="hub-card hub-card-relocation" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.15 200) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.15 200)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-6-5.686-6-10a6 6 0 1112 0c0 4.314-6 10-6 10z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="11" r="2"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Relocation</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.15 200)", background: "color-mix(in oklch, oklch(0.72 0.15 200) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>LIFE</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Moving cities or going remote? See what a salary and cost-of-living change really nets you.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Insurance / Protection */}
              <Link href="/planning/insurance" className="hub-card hub-primary hub-card-insurance" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.70 0.14 165) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.70 0.14 165)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Insurance</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.70 0.14 165)", background: "color-mix(in oklch, oklch(0.70 0.14 165) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>PROTECT</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>How much life, disability, and umbrella coverage you actually need — and the gap to close.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Emergency Fund */}
              <Link href="/planning/emergency-fund" className="hub-card hub-primary hub-card-ef" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.78 0.16 70) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.78 0.16 70)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Emergency Fund</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.78 0.16 70)", background: "color-mix(in oklch, oklch(0.78 0.16 70) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>SAFETY</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>How many months you really need, how close you are, and how fast you&apos;ll get fully funded.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Savings Goal */}
              <Link href="/planning/savings-goal" className="hub-card hub-primary hub-card-goal" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.65 0.18 260) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.65 0.18 260)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Savings Goal</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.65 0.18 260)", background: "color-mix(in oklch, oklch(0.65 0.18 260) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>GOAL</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>A sinking fund for any big purchase — vacation, car, reno. Hit the number by the date.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Elder Care */}
              <Link href="/planning/elder-care" className="hub-card hub-card-eldercare" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.72 0.15 340) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.72 0.15 340)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-6.5-4.35-9-8.5C1.5 9.5 3 6 6.5 6c2 0 3.5 1.5 3.5 2.5C10 7.5 11.5 6 13.5 6 17 6 18.5 9.5 17 12.5 14.5 16.65 12 21 12 21z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Elder Care</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.15 340)", background: "color-mix(in oklch, oklch(0.72 0.15 340) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>FAMILY</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Plan for the cost of caring for an aging parent and see its impact on your own retirement.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Rental Property */}
              <Link href="/planning/rental" className="hub-card hub-card-rental" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.68 0.16 160) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.68 0.16 160)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Rental Property</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.68 0.16 160)", background: "color-mix(in oklch, oklch(0.68 0.16 160) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>INVEST</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Run the numbers on an investment property — cash flow, cap rate, and cash-on-cash return.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Business */}
              <Link href="/planning/business" className="hub-card hub-card-business" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.70 0.16 50) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.70 0.16 50)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9h18v11H3zM3 9l2-5h14l2 5M9 14h6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Business</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.70 0.16 50)", background: "color-mix(in oklch, oklch(0.70 0.16 50) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>VENTURE</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>Thinking of going out on your own? See your runway, breakeven, and the real cost of the leap.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

              {/* Major Medical */}
              <Link href="/planning/medical" className="hub-card hub-card-medical" style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, oklch(0.68 0.19 25) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.68 0.19 25)", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Major Medical</span>
                  </div>
                  <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.68 0.19 25)", background: "color-mix(in oklch, oklch(0.68 0.19 25) 12%, transparent)", padding: "2px 6px", borderRadius: "4px" }}>RISK</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>What a serious health event would really cost — out-of-pocket max plus the income you&apos;d lose.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)", marginTop: "auto" }}>
                  Open <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </Link>

            </div>
            {guided && (
              <button type="button" onClick={() => setHubExpanded((v) => !v)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", marginTop: "10px", padding: "10px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                {hubExpanded ? "Show fewer planners" : "Show all 18 planners"}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={hubExpanded ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>

          {/* Decision Impact Ranking */}
          {lifePlan.biggestDecisions.length > 0 && (
            <div className="hub-section" style={{ animationDelay: "0.12s" }}>
              <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>Decision Impact Ranking</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {lifePlan.biggestDecisions.map((d, i) => {
                  const maxAbs = Math.abs(lifePlan.biggestDecisions[0]?.impact ?? 1);
                  const barScale = maxAbs > 0 ? Math.abs(d.impact) / maxAbs : 0;
                  return (
                    <Link key={i} href={d.href} style={{ textDecoration: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", width: "14px", textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "7px", marginBottom: "4px" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>{d.label}</span>
                            <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)" }}>{d.detail}</span>
                          </div>
                          <div style={{ height: "3px", borderRadius: "2px", background: "var(--border-subtle)", overflow: "hidden" }}>
                            <div className="hub-bar-fill" style={{ height: "100%", borderRadius: "2px", background: d.positive ? "var(--green)" : "var(--red)", transform: `scaleX(${barScale})` }} />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: d.positive ? "var(--green)" : "var(--red)" }}>
                            {d.positive ? "+" : ""}{fmt(Math.abs(d.impact))}
                          </div>
                          <div style={{ fontSize: "9px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>lifetime</div>
                        </div>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Financial Picture divider */}
          <div className="hub-section hub-divider-label" style={{ animationDelay: "0.14s" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Financial Picture</span>
          </div>

          {/* Annual Cashflow Impacts */}
          {lifePlan.impactItems.length > 0 && (
            <div className="hub-section" style={{ animationDelay: "0.16s" }}>
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>Annual Cashflow Impacts</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {lifePlan.impactItems.map((item, i) => {
                  const isPositive = item.annualImpact >= 0;
                  const maxAbs = Math.abs(lifePlan.impactItems[0]?.annualImpact ?? 1);
                  const barScale = maxAbs > 0 ? Math.abs(item.annualImpact) / maxAbs : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 11px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", width: "14px", textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "3px" }}>{item.label}</div>
                        <div style={{ height: "3px", borderRadius: "2px", background: "var(--border-subtle)", overflow: "hidden" }}>
                          <div className="hub-bar-fill" style={{ height: "100%", borderRadius: "2px", background: isPositive ? "var(--green)" : "var(--red)", transform: `scaleX(${barScale})` }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: isPositive ? "var(--green)" : "var(--red)", flexShrink: 0 }}>
                        {isPositive ? "+" : ""}{fmt(item.annualImpact)}/yr
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cross-Plan Insights */}
          <div className="hub-section" style={{ animationDelay: "0.18s" }}>
            <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>Cross-Plan Insights</p>
            {lifePlan.hasRealInsights ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {lifePlan.insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ width: "3px", borderRadius: "2px", flexShrink: 0, alignSelf: "stretch", background: ins.type === "positive" ? "var(--green)" : ins.type === "warning" ? "oklch(0.78 0.17 70)" : "var(--accent)" }} />
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.55 }}>{ins.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.55 }}>
                Build scenarios in at least two planners to see cross-plan interactions.
              </p>
            )}
          </div>

          {/* Timeline divider */}
          <div className="hub-section hub-divider-label" style={{ animationDelay: "0.2s" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Timeline</span>
          </div>

          {/* Life Roadmap */}
          <div className="hub-section" style={{ animationDelay: "0.22s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>Life Roadmap</p>
              {lifePlan.fiYear != null && (
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--green)", background: "color-mix(in oklch, var(--green) 11%, transparent)", padding: "1px 8px", borderRadius: "20px" }}>FI {lifePlan.fiYear}</span>
              )}
            </div>
            {(() => {
              type RMItem = { year: number; label: string; detail: string; type: string; isPlaceholder?: boolean };
              const items: RMItem[] = lifePlan.roadmapItems
                .filter((t) => !t.isPlaceholder)
                .map((t) => ({ ...t }));
              if (lifePlan.fiYear != null && !items.some((t) => t.type === "fi")) {
                items.push({ year: lifePlan.fiYear, label: "Financial Independence", detail: "25× annual expenses reached", type: "fi" });
              }
              items.sort((a, b) => a.year - b.year);
              if (items.length === 0) {
                type PH = { year: number; label: string; href: string; kind: "today" | "ghost" | "cta" };
                const phs: PH[] = [{ year: currentYear, label: "Today", href: "", kind: "today" }];
                if (homeScenarios.length === 0) phs.push({ year: currentYear + 3, label: "Model a home purchase", href: "/planning/home", kind: "cta" });
                if (familyScenarios.length === 0) phs.push({ year: currentYear + 2, label: "Add a family scenario", href: "/planning/family", kind: "cta" });
                if (careerScenarios.length === 0) phs.push({ year: currentYear + 1, label: "Model a career change", href: "/planning/career", kind: "cta" });
                if (educationScenarios.length === 0) phs.push({ year: currentYear + 17, label: "Plan education costs", href: "/planning/education", kind: "cta" });
                if (profile?.current_age != null && profile?.target_retirement_age != null) {
                  phs.push({ year: currentYear + Math.max(1, profile.target_retirement_age - profile.current_age), label: `Retire at ${profile.target_retirement_age}`, href: "/planning?tab=forecast", kind: "ghost" });
                }
                phs.sort((a, b) => a.year - b.year);
                return (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {phs.map((ph, pi) => {
                      const isLast = pi === phs.length - 1;
                      const isToday = ph.kind === "today";
                      const isGhost = ph.kind === "ghost";
                      return (
                        <div key={pi} style={{ display: "flex", gap: "14px", opacity: isToday ? 1 : 0.45 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "28px", flexShrink: 0 }}>
                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isToday ? "var(--text-muted)" : "transparent", border: isToday ? "none" : `1.5px dashed ${isGhost ? "var(--green)" : "var(--border)"}`, flexShrink: 0, marginTop: "4px" }} />
                            {!isLast && <div style={{ flex: 1, width: "1px", borderLeft: "1px dashed var(--border-subtle)", minHeight: "18px", margin: "4px 0" }} />}
                          </div>
                          <div style={{ flex: 1, paddingBottom: isLast ? "0" : "14px" }}>
                            <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontWeight: 600, marginBottom: "4px" }}>{isToday ? "—" : ph.year}</div>
                            {ph.kind === "cta" ? (
                              <Link href={ph.href} style={{ textDecoration: "none" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", border: "1px dashed var(--border)", padding: "2px 8px", borderRadius: "5px" }}>
                                  <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
                                  {ph.label}
                                </span>
                              </Link>
                            ) : (
                              <span style={{ fontSize: isGhost ? "12px" : "11px", fontFamily: "var(--font-body)", fontWeight: isGhost ? 700 : 400, color: isGhost ? "var(--green)" : "var(--text-secondary)" }}>{ph.label}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              const TYPE_COLOR: Record<string, string> = {
                education: "var(--accent)",
                career: "oklch(0.75 0.16 55)",
                family: "oklch(0.72 0.15 340)",
                event: "var(--text-secondary)",
                home: "oklch(0.65 0.14 200)",
                retirement: "var(--green)",
                fi: "var(--green)",
              };
              const byYear = new Map<number, RMItem[]>();
              for (const it of items) {
                if (!byYear.has(it.year)) byYear.set(it.year, []);
                byYear.get(it.year)!.push(it);
              }
              const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
              return (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {sortedYears.map((year, yi) => {
                    const yearItems = byYear.get(year)!;
                    const isConflict = lifePlan.conflictYears.has(year);
                    const isLast = yi === sortedYears.length - 1;
                    const isSpecial = yearItems.some((t) => t.type === "retirement" || t.type === "fi");
                    const dotColor = isConflict
                      ? "oklch(0.78 0.17 70)"
                      : isSpecial
                      ? "var(--green)"
                      : TYPE_COLOR[yearItems[0].type] ?? "var(--border)";
                    return (
                      <div key={year} style={{ display: "flex", gap: "14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "28px", flexShrink: 0 }}>
                          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: "4px", boxShadow: isSpecial || isConflict ? `0 0 7px ${dotColor}` : "none" }} />
                          {!isLast && <div style={{ flex: 1, width: "1px", background: isConflict ? "color-mix(in oklch, oklch(0.78 0.17 70) 35%, var(--border-subtle))" : "var(--border-subtle)", minHeight: "18px", margin: "4px 0" }} />}
                        </div>
                        <div style={{
                          flex: 1, paddingBottom: isLast ? "0" : "14px",
                          paddingLeft: isConflict ? "8px" : "0",
                          paddingRight: isConflict ? "8px" : "0",
                          background: isConflict ? "color-mix(in oklch, oklch(0.78 0.17 70) 4%, transparent)" : "transparent",
                          borderRadius: isConflict ? "var(--radius-sm)" : "0",
                        }}>
                          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: isConflict ? "oklch(0.78 0.17 70)" : "var(--text-muted)", fontWeight: 600, marginBottom: "5px", display: "flex", alignItems: "center", gap: "7px" }}>
                            {year}
                            {isConflict && <span style={{ fontSize: "9px", fontFamily: "var(--font-body)", color: "oklch(0.78 0.17 70)", fontWeight: 400 }}>conflict zone</span>}
                          </div>
                          {yearItems.map((item, ii) => {
                            const color = TYPE_COLOR[item.type] ?? "var(--text-tertiary)";
                            const isSpecialItem = item.type === "retirement" || item.type === "fi";
                            return (
                              <div key={ii} style={{ display: "flex", alignItems: "flex-start", gap: "7px", marginBottom: ii < yearItems.length - 1 ? "5px" : "0" }}>
                                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: color, flexShrink: 0, marginTop: "5px" }} />
                                <div>
                                  <span style={{ fontSize: isSpecialItem ? "12px" : "11px", fontFamily: "var(--font-body)", fontWeight: isSpecialItem ? 700 : 500, color: isSpecialItem ? "var(--green)" : "var(--text-primary)", lineHeight: 1.3 }}>{item.label}</span>
                                  {item.detail && <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginLeft: "6px" }}>{item.detail}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Retirement Milestone */}
          {lifePlan.retirementMilestone && (
            <div className="hub-section" style={{ animationDelay: "0.24s", padding: "14px 18px", borderRadius: "var(--radius-md)", border: "1px solid color-mix(in oklch, var(--green) 22%, var(--border))", background: "color-mix(in oklch, var(--green) 4%, var(--bg-card))", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "color-mix(in oklch, var(--green) 12%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="1.5"><path d="M3 10a7 7 0 1014 0A7 7 0 003 10z"/><path d="M10 6v4l3 3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-body)", color: "var(--green)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Retirement Milestone</div>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.25 }}>{lifePlan.retirementMilestone.label}</div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>{lifePlan.retirementMilestone.detail}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "20px", color: "var(--green)" }}>{lifePlan.retirementMilestone.year}</div>
                {lifePlan.projectedNWAtRetirement != null && (
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>{fmt(Math.round(lifePlan.projectedNWAtRetirement))} projected</div>
                )}
              </div>
            </div>
          )}

          {/* Events divider */}
          <div className="hub-section hub-divider-label" style={{ animationDelay: "0.26s" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>One-Time Events</span>
          </div>

          {/* One-Time Events */}
          <div className="hub-section" style={{ animationDelay: "0.28s" }}>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 12px" }}>Windfalls, major expenses, and other events that affect your forecast.</p>

            {futureEvents.length === 0 && !addingEvent ? (
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>No events yet. Events appear as spikes or dips in your forecast chart.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {futureEvents.map((ev) => (
                  <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: ev.amount_impact >= 0 ? "var(--green)" : "var(--red)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{ev.label}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{ev.event_year}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, color: ev.amount_impact >= 0 ? "var(--green)" : "var(--red)" }}>
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

            {addingEvent ? (
              <form ref={eventFormRef} onSubmit={handleAddEvent} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end", marginTop: "12px" }}>
                <input name="label" required placeholder="e.g. Inheritance" autoFocus style={inputStyle} />
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
                  marginTop: futureEvents.length > 0 ? "8px" : "0",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Add event
              </button>
            )}

            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "12px 0 0" }}>
              Negative amounts for expenses, positive for gains. Events appear in all three forecast bands.
            </p>
          </div>

        </div>
      )}

      {/* ── Tab: Estate & Will ── */}
      {tab === "estate" && (
        <div style={{ ["--card-bg" as string]: "var(--bg-surface)", ["--card-border" as string]: "var(--border-subtle)" }}>
        <EstatePlanningTab
          estateProfile={estateProfile}
          balanceItems={balanceItems}
          portfolioTotalValue={portfolioTotalValue}
          isPrivate={isPrivate}
          profileKids={profileKids}
        />
        </div>
      )}

      {/* ── Tab: Ask Atlas ── */}
      {tab === "finn" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Financial Position Snapshot */}
          <div style={{
            borderRadius: "var(--radius-lg)", overflow: "hidden",
            background: "var(--hero-violet-bg)",
            border: "1px solid var(--hero-violet-border)",
          }}>
            {/* Stats row */}
            <div style={{ display: "flex", gap: "0px", borderBottom: "1px solid var(--hero-violet-line)" }}>
              {[
                { label: "Net Worth", value: isPrivate ? "••••" : (netWorth >= 0 ? `$${Math.round(netWorth / 1000)}k` : `-$${Math.round(Math.abs(netWorth) / 1000)}k`), color: netWorth >= 0 ? "var(--green)" : "var(--red)" },
                { label: "Savings Rate", value: savingsRate > 0 ? `${savingsRate.toFixed(0)}%` : "—", color: savingsRate >= 20 ? "var(--green)" : savingsRate >= 10 ? "var(--amber)" : "var(--red)" },
                { label: "Retirement", value: retirementProb != null ? `${Math.round(retirementProb)}%` : "—", color: (retirementProb ?? 0) >= 75 ? "var(--green)" : (retirementProb ?? 0) >= 50 ? "var(--amber)" : "var(--red)" },
                { label: "Estate Score", value: estateProfile ? `${(() => { const wt: Record<string,number> = {doc_will:20,doc_living_trust:15,doc_durable_poa:20,doc_healthcare_directive:20,doc_beneficiary_desig:15,doc_digital_assets:10}; return (Object.keys(wt) as (keyof EstateProfile)[]).reduce((s,k) => (estateProfile[k] ?? "none") !== "none" ? s + wt[k as string] : s, 0); })()}/100` : "—", color: estateProfile ? ((() => { const wt: Record<string,number> = {doc_will:20,doc_living_trust:15,doc_durable_poa:20,doc_healthcare_directive:20,doc_beneficiary_desig:15,doc_digital_assets:10}; const s = (Object.keys(wt) as (keyof EstateProfile)[]).reduce((acc,k) => (estateProfile[k] ?? "none") !== "none" ? acc + wt[k as string] : acc, 0); return s >= 75 ? "var(--green)" : s >= 45 ? "var(--amber)" : "var(--red)"; })()) : "var(--text-muted)" },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{
                  flex: 1, padding: "12px 16px",
                  borderRight: i < arr.length - 1 ? "1px solid var(--hero-violet-line)" : "none",
                }}>
                  <div style={{ fontSize: "10px", color: "var(--hero-violet-label)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px", fontFamily: "var(--font-body)" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Insight row */}
            <div style={{ padding: "12px 18px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--violet)", flexShrink: 0, marginTop: "5px" }} />
              <p style={{ fontSize: "12px", color: "var(--hero-violet-text)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{finnInsight}</p>
            </div>
          </div>

          {/* Chat panel */}
          <div style={{ display: "flex", flexDirection: "column", height: "520px" }}>

          {/* Atlas header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            paddingBottom: "14px", borderBottom: "1px solid var(--border-subtle)",
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", color: "#fff" }}>A</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>Atlas</div>
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
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", color: "#fff" }}>A</span>
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

            {/* Atlas thinking — contextual states + a soft glowing orb (premium identity) */}
            {finnChatLoading && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                <div className="atlas-thinking-orb" style={{
                  width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", color: "#fff" }}>A</span>
                </div>
                <div style={{
                  padding: "11px 15px", borderRadius: "14px 14px 14px 2px",
                  background: "var(--violet-bg)", border: "1px solid var(--violet-border)",
                  display: "flex", gap: "10px", alignItems: "center",
                }}>
                  <span key={atlasThinkingIdx} style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", animation: "atlasFade 0.4s ease both" }}>
                    {ATLAS_THINKING[atlasThinkingIdx]}
                  </span>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{
                        width: "5px", height: "5px", borderRadius: "50%",
                        background: "var(--violet)", opacity: 0.8,
                        animation: `finnBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggested prompts — visible after Atlas’s intro before user has sent anything */}
          {finnChatMessages.length === 1 && !finnChatLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "12px" }}>
              {(() => {
                type PromptGroup = { domain: string; color: string; prompts: string[] };
                const groups: PromptGroup[] = [];

                // Retirement & Savings
                const retirPrompts: string[] = [];
                if (retirementProb != null && retirementProb < 70) retirPrompts.push(`My retirement probability is ${Math.round(retirementProb)}% — what’s the fastest way to improve it?`);
                if (savingsRate > 0 && savingsRate < 15 && effectiveIncome > 0) retirPrompts.push(`How much more should I save to reach a 15% savings rate?`);
                if (netWorthHistory.length >= 2) retirPrompts.push("Am I building wealth fast enough for my timeline?");
                retirPrompts.push("What should I optimize first?");
                groups.push({ domain: "Retirement & Savings", color: "oklch(0.65 0.18 260)", prompts: retirPrompts.slice(0, 2) });

                // Home & Life Events
                const lifePrompts: string[] = [];
                if (homeScenarios.length === 0) lifePrompts.push("What would buying a home mean for my retirement?");
                if (homeScenarios.length > 0) lifePrompts.push("How does my home purchase affect my long-term net worth?");
                if (careerScenarios.some((s) => s.new_monthly_income < s.current_monthly_income)) lifePrompts.push("How should I prepare financially for my career change?");
                if (familyScenarios.length > 0) lifePrompts.push("How do my child costs affect my savings rate?");
                if (educationScenarios.some((s) => s.current_529_balance < s.annual_cost_today * s.years_in_college)) lifePrompts.push("Is my 529 plan on track to cover college costs?");
                lifePrompts.push("Where am I most financially at risk right now?");
                if (lifePrompts.length > 0) groups.push({ domain: "Life Planning", color: "oklch(0.65 0.16 160)", prompts: lifePrompts.slice(0, 2) });

                // Estate
                const estatePrompts: string[] = [];
                const estDocsComplete = (() => {
                  if (!estateProfile) return 0;
                  const docKeys = ["doc_will","doc_living_trust","doc_durable_poa","doc_healthcare_directive","doc_beneficiary_desig","doc_digital_assets"] as (keyof EstateProfile)[];
                  return docKeys.filter((k) => (estateProfile[k] ?? "none") !== "none").length;
                })();
                if (!estateProfile || estDocsComplete < 3) estatePrompts.push("What estate planning documents should I prioritize first?");
                if (estateProfile && !estateProfile.family_instructions) estatePrompts.push("What should I include in family instructions for my estate?");
                if (estateProfile && (estateProfile.estate_accounts?.length ?? 0) === 0) estatePrompts.push("Which accounts should I document for my family to find?");
                if (estatePrompts.length > 0) groups.push({ domain: "Estate & Protection", color: "oklch(0.65 0.15 30)", prompts: estatePrompts.slice(0, 2) });

                return groups.map((g) => (
                  <div key={g.domain}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: g.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{g.domain}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {g.prompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => { void sendFinnChatMessage(prompt); }}
                          disabled={finnChatLoading}
                          style={{
                            padding: "6px 12px", borderRadius: "20px",
                            border: `1px solid color-mix(in oklch, ${g.color} 30%, transparent)`,
                            background: `color-mix(in oklch, ${g.color} 8%, var(--card-bg))`,
                            color: g.color, fontSize: "11px",
                            fontFamily: "var(--font-body)", cursor: "pointer",
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ));
              })()}
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
              placeholder="Ask Atlas anything about your finances…"
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
            @keyframes atlasGlow {
              0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
              50% { box-shadow: 0 0 0 5px rgba(124,58,237,0.18); }
            }
            .atlas-thinking-orb { animation: atlasGlow 1.8s ease-in-out infinite; }
            @keyframes atlasFade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
          `}</style>
          </div>{/* end inner chat div */}
        </div>
      )}
    </div>
  );
}
