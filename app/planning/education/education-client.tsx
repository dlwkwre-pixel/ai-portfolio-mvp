"use client";

import { useState, useTransition, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { saveEducationScenario, deleteEducationScenario, addEducationToForecast } from "./education-actions";
import type { EducationScenario } from "./education-actions";
import type { FinancialProfile, ProfileKid } from "@/app/planning/planning-actions";
import AtlasThinking from "@/app/planning/atlas-thinking";
import type { EducationFinnRequest } from "@/app/api/planning/education-finn/route";
import { estimateTax } from "@/lib/tax/estimator";
import type { FilingStatus, IncomeType } from "@/lib/tax/estimator";

function getEffectiveNetMonthly(profile: FinancialProfile | null | undefined): number {
  if (!profile) return 0;
  if (profile.net_monthly_override != null) return profile.net_monthly_override;
  const gross = profile.gross_monthly_income ?? 0;
  if (gross <= 0) return 0;
  return estimateTax(
    gross,
    (profile.filing_status as FilingStatus) ?? "single",
    (profile.income_type as IncomeType) ?? "w2",
    profile.state_code ?? "",
    profile.pre_tax_deductions_annual ?? 0,
  ).netMonthly;
}

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

function yearsToFI(currentNW: number, monthlySavings: number, targetNW: number, mr: number): number | null {
  if (currentNW >= targetNW) return 0;
  if (monthlySavings <= 0) return null;
  for (let y = 1; y <= 60; y++) {
    const mo = y * 12;
    const fv = currentNW * Math.pow(1 + mr, mo) + (mr > 0 ? monthlySavings * ((Math.pow(1 + mr, mo) - 1) / mr) : monthlySavings * mo);
    if (fv >= targetNW) return y;
  }
  return null;
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

// ── Presets ───────────────────────────────────────────────────────────────────

type Preset = { label: string; annualCost: number; inflation: number; years: number };
const PRESETS: Record<string, Preset> = {
  "public-in-state": { label: "Public In-State",      annualCost: 28000, inflation: 0.04, years: 4 },
  "public-oos":      { label: "Public Out-of-State",  annualCost: 45000, inflation: 0.05, years: 4 },
  "private":         { label: "Private University",   annualCost: 60000, inflation: 0.05, years: 4 },
  "community":       { label: "Community + Transfer", annualCost: 18000, inflation: 0.03, years: 2 },
  "trade":           { label: "Trade / Vocational",   annualCost: 12000, inflation: 0.03, years: 2 },
  "military":        { label: "Military Path",        annualCost: 0,     inflation: 0,    years: 4 },
  "custom":          { label: "Custom",               annualCost: 35000, inflation: 0.05, years: 4 },
};

// ── Verdict ───────────────────────────────────────────────────────────────────

type VerdictType = "FULLY_FUNDED" | "ON_TRACK" | "PARTIALLY_FUNDED" | "UNDERFUNDED";

function computeVerdictType(coveragePct: number): VerdictType {
  if (coveragePct >= 100) return "FULLY_FUNDED";
  if (coveragePct >= 80)  return "ON_TRACK";
  if (coveragePct >= 40)  return "PARTIALLY_FUNDED";
  return "UNDERFUNDED";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FamilyChild = { id: string; name: string; age: number };
type EduChild = { id: string; name: string; age: number; scholarshipPct: number };
type NeedleLever = { label: string; improvementK: number; description: string };
type CompRow = { label: string; coveragePct: number; gap: number; monthlyNeeded: number; verdictTag: string; verdictColor: string };
type AltPath = { key: string; label: string; totalCost: number; gap: number; surplus: number; coveragePct: number };
type BenchmarkItem = { label: string; projCost: number; isCurrent: boolean };

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
  fiYearsBefore: number | null;
  fiYearsAfter: number | null;
  monthlySavingsBefore: number | null;
  monthlySavingsAfter: number | null;
  flipContribution: number | null;
  flipCostReduction: number | null;
  flipReturn: number | null;
  opportunityCostRetirement: number | null;
  autoNarrative: string;
  // P1 Optimizer
  optimalRetirMonthly: number | null;
  optimalCollegeMonthly: number | null;
  optimalRetirProb: number | null;
  optimalCollegeCoverage: number | null;
  optimalPlanScore: number | null;
  // P3 Smarter Verdict
  contextVerdictLabel: string;
  contextVerdictSubtitle: string;
  contextVerdictBullets: { positive: boolean; text: string }[];
  contextVerdictColor: string;
  contextVerdictBg: string;
  // P4 Needle Levers
  needleLevers: NeedleLever[];
  // P5 Comparison
  comparisonRows: CompRow[];
  // P6 Alt Paths
  altPaths: AltPath[];
  // P7 Benchmarks
  benchmarkContext: BenchmarkItem[];
};

let _eduChildId = 0;
function makeEduChildId() { return `edu-${_eduChildId++}`; }

type FormState = {
  name: string;
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
  eduChildren: EduChild[],
  preset: string,
  profile: FinancialProfile | null,
  currentNetWorth: number,
): Computed529 {
  const { years_in_college: yrs, annual_cost_today: costToday,
    cost_inflation_rate: inflation, current_529_balance: bal529, monthly_contribution: monthly,
    investment_return: ret } = f;

  const numChildren = eduChildren.length || 1;
  const primaryChild = eduChildren[0];
  const childAge = primaryChild?.age ?? 0;

  const yearsUntilCollege = Math.max(0, 18 - childAge);
  const futureAnnualCost = costToday * Math.pow(1 + inflation, yearsUntilCollege);
  const totalCollegeCost = futureAnnualCost * yrs;

  const effectiveTotalCost = eduChildren.reduce((sum, c) => {
    const yrsForChild = Math.max(0, 18 - c.age);
    const futureAnnualForChild = costToday * Math.pow(1 + inflation, yrsForChild);
    return sum + futureAnnualForChild * yrs * (1 - c.scholarshipPct / 100);
  }, 0);
  const scholarshipSavings = eduChildren.reduce((sum, c) => {
    const yrsForChild = Math.max(0, 18 - c.age);
    const futureAnnualForChild = costToday * Math.pow(1 + inflation, yrsForChild);
    return sum + futureAnnualForChild * yrs * (c.scholarshipPct / 100);
  }, 0);

  const primaryScholarshipPct = eduChildren[0]?.scholarshipPct ?? 0;

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

  const chartData = Array.from({ length: yearsUntilCollege + 1 }, (_, i) => {
    const months = i * 12;
    const balance = months === 0
      ? bal529
      : bal529 * Math.pow(1 + mr, months) +
        (mr > 0 ? monthly * ((Math.pow(1 + mr, months) - 1) / mr) : monthly * months);
    const target = effectiveTotalCost > 0 ? Math.round(effectiveTotalCost * Math.pow(1 + inflation, i) / Math.pow(1 + inflation, yearsUntilCollege)) : 0;
    return { year: i, balance: Math.round(balance), target: Math.round(Math.max(0, target)), label: i === 0 ? "Now" : `Yr ${i}` };
  });

  const verdictType = computeVerdictType(coveragePct);
  const pctStr = Math.round(Math.min(coveragePct, 100));

  const verdictReasons: string[] = [
    `Current contributions cover ${pctStr}% of projected ${numChildren > 1 ? `${numChildren}-child ` : ""}college costs`,
  ];
  if (yearsUntilCollege >= 5) verdictReasons.push(`${yearsUntilCollege} years until enrollment to build savings`);
  else if (yearsUntilCollege > 0) verdictReasons.push(`Only ${yearsUntilCollege} year${yearsUntilCollege === 1 ? "" : "s"} until enrollment — urgency is high`);
  if (scholarshipSavings > 0) verdictReasons.push(`Scholarship assumptions reduce required funding by ${fmtK(scholarshipSavings)}`);
  else if (coveragePct < 80) verdictReasons.push("College inflation may outpace the current savings rate");
  if (coveragePct >= 100) verdictReasons.push("Retirement planning is not impacted by current contributions");

  const confidencePct = coveragePct >= 100
    ? Math.min(95, Math.round(90 + (coveragePct - 100) / 20))
    : Math.round(40 + coveragePct * 0.45);

  const rem80 = effectiveTotalCost * 0.80 - pvGrowth;
  const suggestedMonthly = rem80 <= 0 || mo === 0
    ? monthly
    : Math.max(0, mr > 0 ? (rem80 * mr) / (Math.pow(1 + mr, mo) - 1) : rem80 / mo);

  const fundingTargets = [50, 75, 100, 125].map((pct) => {
    const tCost = effectiveTotalCost * (pct / 100);
    const rem = tCost - pvGrowth;
    const m = rem <= 0 || mo === 0 ? 0 : mr > 0 ? (rem * mr) / (Math.pow(1 + mr, mo) - 1) : rem / mo;
    return { pct, monthly: Math.max(0, m) };
  });

  // Ecosystem (retirement impact)
  let retirAssetsBefore: number | null = null;
  let retirAssetsAfter: number | null = null;
  let retirProbBefore: number | null = null;
  let retirProbAfter: number | null = null;
  let fiYearsBefore: number | null = null;
  let fiYearsAfter: number | null = null;
  let monthlySavingsBefore: number | null = null;
  let monthlySavingsAfter: number | null = null;
  let retirImpactScore = 15;

  if (profile?.gross_monthly_income && profile?.monthly_expenses && profile?.current_age && profile?.target_retirement_age) {
    const yToRetir = Math.max(0, profile.target_retirement_age - profile.current_age);
    const inc = getEffectiveNetMonthly(profile);
    const exp = profile.monthly_expenses;
    monthlySavingsBefore = inc - exp;
    monthlySavingsAfter = inc - exp - monthly;
    retirAssetsBefore = fvCalc(currentNetWorth, Math.max(0, monthlySavingsBefore), yToRetir, ret);
    retirAssetsAfter  = fvCalc(currentNetWorth, Math.max(0, monthlySavingsAfter),  yToRetir, ret);
    retirProbBefore = retirProb(retirAssetsBefore, exp * 12);
    retirProbAfter  = retirProb(retirAssetsAfter,  exp * 12);
    const drop = retirProbBefore - (retirProbAfter ?? 0);
    retirImpactScore = drop < 3 ? 15 : drop < 7 ? 11 : drop < 12 ? 7 : 3;
    const fiTarget = exp * 12 * 25;
    const mr = ret / 12;
    fiYearsBefore = yearsToFI(currentNetWorth, Math.max(0, monthlySavingsBefore), fiTarget, mr);
    fiYearsAfter  = yearsToFI(currentNetWorth, Math.max(0, monthlySavingsAfter),  fiTarget, mr);
  }

  // Readiness score
  const rS_prog    = Math.round(Math.min(coveragePct, 100) * 0.30);
  const rS_time    = yearsUntilCollege >= 10 ? 20 : yearsUntilCollege >= 7 ? 17 : yearsUntilCollege >= 5 ? 14 : yearsUntilCollege >= 3 ? 9 : yearsUntilCollege >= 1 ? 5 : 2;
  const rS_contrib = monthlyNeeded > 0 ? Math.min(20, Math.round((monthly / monthlyNeeded) * 20)) : 20;
  const gapRatio   = effectiveTotalCost > 0 ? fundingGap / effectiveTotalCost : 0;
  const rS_gap     = gapRatio < 0.05 ? 15 : gapRatio < 0.2 ? 11 : gapRatio < 0.4 ? 7 : gapRatio < 0.7 ? 3 : 0;
  const readinessComponents = [
    { label: "Funding Progress",      score: rS_prog,          max: 30 },
    { label: "Time Until Enrollment", score: rS_time,          max: 20 },
    { label: "Contribution Adequacy", score: rS_contrib,       max: 20 },
    { label: "Funding Gap",           score: rS_gap,           max: 15 },
    { label: "Retirement Impact",     score: retirImpactScore, max: 15 },
  ];
  const readinessScore = readinessComponents.reduce((s, c) => s + c.score, 0);

  // Flip thresholds
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

  // Opportunity cost
  let opportunityCostRetirement: number | null = null;
  if (monthly > 0 && profile?.current_age && profile?.target_retirement_age) {
    opportunityCostRetirement = fvCalc(0, monthly, Math.max(0, profile.target_retirement_age - profile.current_age), ret);
  }

  // Auto narrative
  const childStr = numChildren > 1 ? `${numChildren} children` : "college";
  let autoNarrative = "Enter your scenario details to get a personalized funding analysis.";
  if (effectiveTotalCost > 0) {
    if (verdictType === "FULLY_FUNDED") {
      autoNarrative = `Your 529 is on pace to fully cover projected ${childStr} costs. At ${fmt(monthly)}/mo you'll have ${fmtK(fv529)} at enrollment — ${fmtK(fv529 - effectiveTotalCost)} above the ${fmtK(effectiveTotalCost)} target. Retirement impact is minimal.`;
    } else if (verdictType === "ON_TRACK") {
      autoNarrative = `You're on track to fund ${pctStr}% of projected ${childStr} costs. ${flipContribution ? `A modest increase of ${fmt(flipContribution)}/mo would close the remaining ${fmtK(fundingGap)} gap.` : "Continue at the current rate."} Your retirement trajectory is healthy alongside these contributions.`;
    } else if (verdictType === "PARTIALLY_FUNDED") {
      autoNarrative = `Current contributions will cover approximately ${pctStr}% of projected ${childStr} costs${scholarshipSavings > 0 ? ` after scholarships` : ""}. ${flipContribution ? `Increasing by ${fmt(flipContribution)}/mo reaches 80% coverage.` : ""} ${yearsUntilCollege > 3 ? `With ${yearsUntilCollege} years until enrollment, there is still time to close this gap.` : "Enrollment is approaching — prioritize contributions soon."}`;
    } else {
      autoNarrative = `At the current savings rate, the 529 will cover only ${pctStr}% of projected ${childStr} costs. ${flipContribution ? `Adding ${fmt(flipContribution)}/mo reaches the 80% threshold.` : "A significant increase is needed."} ${flipCostReduction ? `Alternatively, reducing expected costs by ${fmtK(flipCostReduction)} through scholarships or school choice could close the gap.` : ""}`;
    }
  }

  // ── P1: Retirement vs College Optimizer ──────────────────────────────────────
  let optimalRetirMonthly: number | null = null;
  let optimalCollegeMonthly: number | null = null;
  let optimalRetirProb: number | null = null;
  let optimalCollegeCoverage: number | null = null;
  let optimalPlanScore: number | null = null;

  if (profile?.gross_monthly_income && profile?.monthly_expenses && profile?.current_age && profile?.target_retirement_age && effectiveTotalCost > 0) {
    const yToRetir = Math.max(0, profile.target_retirement_age - profile.current_age);
    const totalBudget = Math.max(0, getEffectiveNetMonthly(profile) - profile.monthly_expenses);
    const annualExp = profile.monthly_expenses * 12;
    const step = Math.max(10, Math.round(totalBudget / 80) * 10);

    let bestScore = -1;
    let bestRetirMo = 0;
    let bestCollegeMo = 0;

    for (let rMo = 0; rMo <= totalBudget; rMo += step) {
      const cMo = totalBudget - rMo;
      const rAssets = fvCalc(currentNetWorth, rMo, yToRetir, ret);
      const rP = retirProb(rAssets, annualExp);
      const fvC = fvCalc(bal529, cMo, yearsUntilCollege, ret);
      const cov = effectiveTotalCost > 0 ? Math.min(100, (fvC / effectiveTotalCost) * 100) : 100;
      const score = rP * 0.5 + cov * 0.5;
      if (score > bestScore) { bestScore = score; bestRetirMo = rMo; bestCollegeMo = cMo; }
    }

    const fineStart = Math.max(0, bestRetirMo - step);
    const fineEnd = Math.min(totalBudget, bestRetirMo + step);
    for (let rMo = fineStart; rMo <= fineEnd; rMo += 10) {
      const cMo = totalBudget - rMo;
      const rAssets = fvCalc(currentNetWorth, rMo, yToRetir, ret);
      const rP = retirProb(rAssets, annualExp);
      const fvC = fvCalc(bal529, cMo, yearsUntilCollege, ret);
      const cov = effectiveTotalCost > 0 ? Math.min(100, (fvC / effectiveTotalCost) * 100) : 100;
      const score = rP * 0.5 + cov * 0.5;
      if (score > bestScore) { bestScore = score; bestRetirMo = rMo; bestCollegeMo = cMo; }
    }

    const optRetirAssets = fvCalc(currentNetWorth, bestRetirMo, yToRetir, ret);
    const optFv = fvCalc(bal529, bestCollegeMo, yearsUntilCollege, ret);
    optimalRetirMonthly   = Math.round(bestRetirMo / 10) * 10;
    optimalCollegeMonthly = Math.round(bestCollegeMo / 10) * 10;
    optimalRetirProb      = retirProb(optRetirAssets, annualExp);
    optimalCollegeCoverage = Math.round(effectiveTotalCost > 0 ? Math.min(100, (optFv / effectiveTotalCost) * 100) : 100);
    optimalPlanScore      = Math.round(bestScore);
  }

  // ── P3: Smarter Verdict ───────────────────────────────────────────────────────
  const retirDrop = retirProbBefore != null && retirProbAfter != null ? retirProbBefore - retirProbAfter : 0;
  const hasRetirData = retirProbBefore != null;
  let contextVerdictLabel: string;
  let contextVerdictSubtitle: string;
  let contextVerdictBullets: { positive: boolean; text: string }[];
  let contextVerdictColor: string;
  let contextVerdictBg: string;

  if (coveragePct >= 100 && (!hasRetirData || retirDrop <= 3)) {
    contextVerdictLabel    = "Fully Funded";
    contextVerdictSubtitle = `${Math.round(Math.min(coveragePct, 100))}% Coverage`;
    contextVerdictColor    = "oklch(0.72 0.18 145)";
    contextVerdictBg       = "oklch(0.72 0.18 145 / 0.08)";
    contextVerdictBullets  = [
      { positive: true,  text: "College fully funded at current pace" },
      { positive: true,  text: hasRetirData ? "Retirement remains on track" : "Contribution path is sustainable" },
      { positive: true,  text: "No immediate action required" },
    ];
  } else if (coveragePct >= 100 && hasRetirData && retirDrop > 8) {
    contextVerdictLabel    = "Overfunded";
    contextVerdictSubtitle = "College Fully Funded";
    contextVerdictColor    = "oklch(0.78 0.15 80)";
    contextVerdictBg       = "oklch(0.78 0.15 80 / 0.08)";
    contextVerdictBullets  = [
      { positive: false, text: "Retirement probability declining with current split" },
      { positive: false, text: "Capital may be better deployed to retirement" },
      { positive: true,  text: "College gap is fully covered" },
    ];
  } else if (coveragePct >= 75 && (!hasRetirData || retirDrop <= 5)) {
    contextVerdictLabel    = "On Track";
    contextVerdictSubtitle = `${Math.round(coveragePct)}% Coverage`;
    contextVerdictColor    = "oklch(0.65 0.15 250)";
    contextVerdictBg       = "oklch(0.65 0.15 250 / 0.08)";
    contextVerdictBullets  = [
      { positive: true,  text: hasRetirData ? "Retirement remains healthy" : "Contribution pace is solid" },
      { positive: true,  text: "Funding gap is manageable" },
      { positive: true,  text: "Current contribution path sufficient" },
    ];
  } else if (coveragePct >= 40) {
    contextVerdictLabel    = "Stretch";
    contextVerdictSubtitle = `${Math.round(coveragePct)}% Coverage`;
    contextVerdictColor    = "oklch(0.78 0.15 80)";
    contextVerdictBg       = "oklch(0.78 0.15 80 / 0.08)";
    contextVerdictBullets  = [
      { positive: false, text: `${fmtK(fundingGap)} funding gap requires attention` },
      { positive: false, text: yearsUntilCollege < 5 ? "Enrollment approaching — urgency is high" : "Contributions need to increase" },
      { positive: true,  text: hasRetirData && retirDrop <= 5 ? "Retirement trajectory not at risk yet" : "Time remains to course-correct" },
    ];
  } else {
    contextVerdictLabel    = "At Risk";
    contextVerdictSubtitle = `${Math.round(coveragePct)}% Coverage`;
    contextVerdictColor    = "oklch(0.70 0.18 25)";
    contextVerdictBg       = "oklch(0.70 0.18 25 / 0.08)";
    contextVerdictBullets  = [
      { positive: false, text: `Current pace leaves a ${fmtK(fundingGap)} shortfall` },
      { positive: false, text: "Significant contribution increase needed" },
      { positive: false, text: yearsUntilCollege < 3 ? "Enrollment is imminent" : "Early action compounds most effectively" },
    ];
  }

  // ── P4: What Moves the Needle Most ───────────────────────────────────────────
  const needleLevers: NeedleLever[] = [];

  if (primaryScholarshipPct < 50 && effectiveTotalCost > 0) {
    const schCost50 = eduChildren.reduce((sum, c) => {
      const y = Math.max(0, 18 - c.age);
      return sum + costToday * Math.pow(1 + inflation, y) * yrs * 0.50;
    }, 0);
    const improvement = Math.max(0, effectiveTotalCost - schCost50);
    if (improvement > 1000) needleLevers.push({ label: "50% Scholarship", improvementK: improvement, description: "Merit or need-based aid" });
  }

  if (preset !== "public-in-state" && effectiveTotalCost > 0) {
    const pubFutAnn = 28000 * Math.pow(1 + 0.04, yearsUntilCollege);
    const pubEffective = Math.max(0, pubFutAnn * 4 * numChildren * (1 - primaryScholarshipPct / 100));
    const improvement = Math.max(0, effectiveTotalCost - pubEffective);
    if (improvement > 1000) needleLevers.push({ label: "Public vs Private School", improvementK: improvement, description: "Switch to public in-state" });
  }

  if (monthly >= 0 && effectiveTotalCost > 0 && mo > 0) {
    const fv200 = fvCalc(bal529, monthly + 200, yearsUntilCollege, ret);
    const improvement = Math.max(0, fv200 - fv529);
    if (improvement > 500) needleLevers.push({ label: "Increase by $200/mo", improvementK: improvement, description: "Additional monthly savings" });
  }

  if (yearsUntilCollege > 0 && childAge < 17 && effectiveTotalCost > 0) {
    const fvDelay = fvCalc(bal529, monthly, yearsUntilCollege + 1, ret);
    const targetDelay = costToday * Math.pow(1 + inflation, yearsUntilCollege + 1) * yrs * numChildren * (1 - primaryScholarshipPct / 100);
    const gapDelay = Math.max(0, targetDelay - fvDelay);
    const improvement = Math.max(0, fundingGap - gapDelay);
    if (improvement > 500) needleLevers.push({ label: "Delay Enrollment 1 Year", improvementK: improvement, description: "Extra year of compound growth" });
  }

  needleLevers.sort((a, b) => b.improvementK - a.improvementK);

  // ── P5: Scenario Comparison ───────────────────────────────────────────────────
  function buildCompRow(label: string, annCost: number, inf: number, yrsC: number, nC: number, schP: number): CompRow {
    const futAnn = annCost * Math.pow(1 + inf, yearsUntilCollege);
    const effective = Math.max(0, futAnn * yrsC * nC * (1 - schP / 100));
    const fv = mo === 0 ? bal529 : bal529 * Math.pow(1 + mr, mo) + (mr > 0 ? monthly * ((Math.pow(1 + mr, mo) - 1) / mr) : monthly * mo);
    const cov = effective > 0 ? Math.min(999, (fv / effective) * 100) : 100;
    const gap = Math.max(0, effective - fv);
    const pvG = bal529 * (mo > 0 ? Math.pow(1 + mr, mo) : 1);
    const rem = effective - pvG;
    const needed = rem <= 0 || mo === 0 ? 0 : mr > 0 ? (rem * mr) / (Math.pow(1 + mr, mo) - 1) : rem / mo;
    const tag = cov >= 100 ? "On Track" : cov >= 80 ? "Strong" : cov >= 40 ? "Partial" : "Review";
    const color = cov >= 100 ? "oklch(0.72 0.18 145)" : cov >= 80 ? "oklch(0.65 0.15 250)" : cov >= 40 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)";
    return { label, coveragePct: Math.round(Math.min(cov, 100)), gap, monthlyNeeded: Math.max(0, needed), verdictTag: tag, verdictColor: color };
  }

  const comparisonRows: CompRow[] = [
    buildCompRow("Current Scenario",     costToday, inflation, yrs, numChildren, primaryScholarshipPct),
    buildCompRow("Public In-State",      28000, 0.04, 4, numChildren, primaryScholarshipPct),
    buildCompRow("Private University",   60000, 0.05, 4, numChildren, primaryScholarshipPct),
    buildCompRow("50% Scholarship",      costToday, inflation, yrs, numChildren, 50),
    buildCompRow("Two Children",         costToday, inflation, yrs, 2, primaryScholarshipPct),
  ];

  // ── P6: Alternative Education Paths ──────────────────────────────────────────
  const altPaths: AltPath[] = Object.entries(PRESETS)
    .filter(([key]) => key !== "custom")
    .map(([key, p]) => {
      const futAnn = p.annualCost * Math.pow(1 + p.inflation, yearsUntilCollege);
      const totalC = futAnn * p.years;
      const effective = Math.max(0, totalC * numChildren * (1 - primaryScholarshipPct / 100));
      const fvPath = mo === 0 ? bal529 : bal529 * Math.pow(1 + mr, mo) + (mr > 0 ? monthly * ((Math.pow(1 + mr, mo) - 1) / mr) : monthly * mo);
      const gap = Math.max(0, effective - fvPath);
      const surplus = Math.max(0, fvPath - effective);
      const cov = effective > 0 ? Math.min(999, (fvPath / effective) * 100) : 100;
      return { key, label: p.label, totalCost: Math.round(effective), gap: Math.round(gap), surplus: Math.round(surplus), coveragePct: Math.round(Math.min(cov, 100)) };
    });

  // ── P7: Benchmarks ────────────────────────────────────────────────────────────
  const BENCHMARK_BASES = [
    { label: "Community College", annualBase: 18000, inflation: 0.03, years: 2 },
    { label: "Public In-State",   annualBase: 28000, inflation: 0.04, years: 4 },
    { label: "Public OOS",        annualBase: 45000, inflation: 0.05, years: 4 },
    { label: "Private Univ.",     annualBase: 60000, inflation: 0.05, years: 4 },
    { label: "Elite Private",     annualBase: 90000, inflation: 0.055, years: 4 },
  ];
  const benchmarkContext: BenchmarkItem[] = BENCHMARK_BASES.map((b) => ({
    label: b.label,
    projCost: Math.round(b.annualBase * Math.pow(1 + b.inflation, yearsUntilCollege) * b.years),
    isCurrent: Math.abs(costToday - b.annualBase) < 5000 && yrs === b.years,
  }));

  return {
    yearsUntilCollege, futureAnnualCost, totalCollegeCost, effectiveTotalCost,
    scholarshipSavings, fv529, coveragePct, monthlyNeeded, fundingGap, chartData,
    verdictType, verdictReasons, confidencePct, suggestedMonthly,
    readinessScore, readinessComponents, fundingTargets,
    retirAssetsBefore, retirAssetsAfter, retirProbBefore, retirProbAfter,
    fiYearsBefore, fiYearsAfter,
    monthlySavingsBefore, monthlySavingsAfter,
    flipContribution, flipCostReduction, flipReturn,
    opportunityCostRetirement, autoNarrative,
    optimalRetirMonthly, optimalCollegeMonthly, optimalRetirProb, optimalCollegeCoverage, optimalPlanScore,
    contextVerdictLabel, contextVerdictSubtitle, contextVerdictBullets, contextVerdictColor, contextVerdictBg,
    needleLevers, comparisonRows, altPaths, benchmarkContext,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: EducationScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  currentNetWorth: number;
  familyChildren: FamilyChild[];
  profileKids?: ProfileKid[];
};

export default function EducationClient({ scenarios: initialScenarios, profile, defaultInvestmentReturn, currentNetWorth, familyChildren, profileKids = [] }: Props) {
  const [scenarios, setScenarios]               = useState<EducationScenario[]>(initialScenarios);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [form, setForm]                         = useState<FormState>(() => defaultForm(profile, defaultInvestmentReturn));
  const [saving, startSaving]                   = useTransition();
  const [deleting, startDeleting]               = useTransition();
  const [saveStatus, setSaveStatus]             = useState<string | null>(null);
  const [commentary, setCommentary]             = useState<string | null>(null);
  const [loadingCommentary, setLoadingCommentary] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    initialScenarios.length > 0 ? initialScenarios[0].id : null,
  );
  const [eduChildren, setEduChildren] = useState<EduChild[]>(() => {
    const first = initialScenarios[0];
    return first
      ? [{ id: makeEduChildId(), name: first.child_name ?? "", age: first.child_current_age, scholarshipPct: 0 }]
      : [{ id: makeEduChildId(), name: "", age: 0, scholarshipPct: 0 }];
  });
  const [preset, setPreset]                     = useState<string>("custom");
  const [addingForecast, startAddForecast]       = useTransition();
  const [forecastStatus, setForecastStatus]      = useState<string | null>(null);


  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;

  const src = useMemo<FormState>(() => {
    if (editingId != null) return form;
    if (activeScenario) return {
      name: activeScenario.name,
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
    computeAll(src, eduChildren, preset, profile, currentNetWorth),
    [src, eduChildren, preset, profile, currentNetWorth],
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

  function selectEduScenario(id: string) {
    const s = scenarios.find(sc => sc.id === id);
    if (!s) return;
    setActiveScenarioId(id);
    setEditingId(null);
    setCommentary(null);
    setEduChildren([{ id: makeEduChildId(), name: s.child_name ?? "", age: s.child_current_age, scholarshipPct: 0 }]);
  }

  function importFamilyChild(child: FamilyChild) {
    setEduChildren(prev => prev.map((c, i) => i === 0 ? { ...c, name: child.name, age: child.age } : c));
    setPreset("custom");
    setSaveStatus(null);
    setCommentary(null);
  }

  function startEdit(s: EducationScenario) {
    setEditingId(s.id);
    setActiveScenarioId(s.id);
    setForm({
      name: s.name,
      years_in_college: s.years_in_college,
      annual_cost_today: Number(s.annual_cost_today),
      cost_inflation_rate: Number(s.cost_inflation_rate),
      current_529_balance: Number(s.current_529_balance),
      monthly_contribution: Number(s.monthly_contribution),
      investment_return: Number(s.investment_return),
    });
    setEduChildren([{ id: makeEduChildId(), name: s.child_name ?? "", age: s.child_current_age, scholarshipPct: 0 }]);
    setCommentary(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(defaultForm(profile, defaultInvestmentReturn));
    setEduChildren([{ id: makeEduChildId(), name: "", age: 0, scholarshipPct: 0 }]);
    setSaveStatus(null);
  }

  function handleSave() {
    startSaving(async () => {
      setSaveStatus(null);
      const primaryEduChild = eduChildren[0];
      const payload = {
        name: form.name || "College Savings",
        child_name: primaryEduChild?.name || null,
        child_current_age: primaryEduChild?.age ?? 0,
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
      child_name: eduChildren[0]?.name || null,
      child_current_age: eduChildren[0]?.age ?? 0,
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
      setCommentary("Failed to get Atlas commentary.");
    } finally {
      setLoadingCommentary(false);
    }
  }

  function handleAddEduToForecast() {
    startAddForecast(async () => {
      const result = await addEducationToForecast({
        childName: eduChildren[0]?.name || null,
        childCurrentAge: eduChildren[0]?.age ?? 0,
        yearsInCollege: src.years_in_college,
        annualCostToday: src.annual_cost_today,
        costInflationRate: src.cost_inflation_rate,
        currentYear: new Date().getFullYear(),
      });
      if (result.error) {
        setForecastStatus(result.error);
      } else if (result.added === 0) {
        setForecastStatus("No college years to add.");
      } else {
        setForecastStatus(`Added ${result.added} college year events to your Life Forecast.`);
      }
    });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <a href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Planning
          </a>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Education / 529</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>College Funding Decision Engine</h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Am I on track? How much should I save?</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: "flex", overflowY: "auto", minHeight: 0 }} data-edu-cols>

        {/* Left sidebar */}
        <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", alignSelf: "flex-start", padding: "20px 20px 40px" }} data-edu-sidebar>

          {/* Per-child rows */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>Children</p>
            {eduChildren.map((child, idx) => (
              <div key={child.id} style={{ marginBottom: 12, padding: "12px", background: "oklch(0.13 0.02 250 / 0.6)", borderRadius: 10, border: "1px solid oklch(0.25 0.03 250 / 0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.62 0.12 250)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Child {idx + 1}</span>
                  {eduChildren.length > 1 && (
                    <button onClick={() => setEduChildren(prev => prev.filter(c => c.id !== child.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px" }} title="Remove child"><span aria-hidden="true">×</span><span className="bt-sr-only">Remove</span></button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={child.name}
                  onChange={e => setEduChildren(prev => prev.map(c => c.id === child.id ? { ...c, name: e.target.value } : c))}
                  style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 9px", color: "var(--text-primary)", fontSize: 12, boxSizing: "border-box", marginBottom: 7 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>Age</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={child.age}
                    onChange={e => setEduChildren(prev => prev.map(c => c.id === child.id ? { ...c, age: Number(e.target.value) } : c))}
                    style={{ width: "60px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 8px", color: "var(--text-primary)", fontSize: 12, fontFamily: "var(--font-mono)", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.65 0.12 145)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Scholarship</label>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "oklch(0.72 0.18 145)", fontWeight: 700 }}>{child.scholarshipPct === 0 ? "None" : child.scholarshipPct === 100 ? "Full" : `${child.scholarshipPct}%`}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={child.scholarshipPct}
                    onChange={e => setEduChildren(prev => prev.map(c => c.id === child.id ? { ...c, scholarshipPct: Number(e.target.value) } : c))}
                    style={{ width: "100%", marginBottom: 5, accentColor: "oklch(0.72 0.18 145)" }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    {([0, 25, 50, 75, 100] as const).map(pct => (
                      <button key={pct} onClick={() => setEduChildren(prev => prev.map(c => c.id === child.id ? { ...c, scholarshipPct: pct } : c))} style={{ flex: 1, padding: "4px 0", borderRadius: 5, fontSize: 10, fontWeight: child.scholarshipPct === pct ? 700 : 500, cursor: "pointer", background: child.scholarshipPct === pct ? "oklch(0.72 0.18 145 / 0.15)" : "transparent", color: child.scholarshipPct === pct ? "oklch(0.72 0.18 145)" : "var(--text-muted)", border: child.scholarshipPct === pct ? "1px solid oklch(0.72 0.18 145 / 0.4)" : "1px solid var(--border)", fontFamily: "var(--font-mono)", transition: "all 0.12s" }}>
                        {pct === 0 ? "0" : pct === 100 ? "Full" : `${pct}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => setEduChildren(prev => [...prev, { id: makeEduChildId(), name: "", age: 0, scholarshipPct: 0 }])}
              style={{ width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "transparent", color: "oklch(0.62 0.12 250)", border: "1px dashed oklch(0.45 0.12 250 / 0.4)", transition: "all 0.15s" }}
            >
              + Add Child
            </button>
            {computed.scholarshipSavings > 0 && (
              <div style={{ fontSize: 11, color: "oklch(0.65 0.12 145)", marginTop: 8, padding: "5px 8px", background: "oklch(0.72 0.18 145 / 0.06)", borderRadius: 6, border: "1px solid oklch(0.72 0.18 145 / 0.12)" }}>
                Scholarship saves {fmtK(computed.scholarshipSavings)} total
              </div>
            )}
          </div>

          {/* College Type */}
          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>College Type</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
            {Object.entries(PRESETS).map(([key, p]) => {
              const active = preset === key;
              return (
                <button key={key} onClick={() => applyPreset(key)} style={{ padding: "7px 8px", borderRadius: 8, fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer", background: active ? "oklch(0.45 0.18 250 / 0.15)" : "var(--bg-elevated, var(--bg-base))", color: active ? "oklch(0.72 0.15 250)" : "var(--text-secondary)", border: active ? "1px solid oklch(0.45 0.18 250 / 0.4)" : "1px solid var(--border)", textAlign: "left", transition: "all 0.15s ease" }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Profile Kids import */}
          {profileKids.length > 0 && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>From Profile</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
                {profileKids.map((kid, i) => (
                  <button key={i} onClick={() => importFamilyChild({ id: `profile-${i}`, name: kid.name || `Child ${i + 1}`, age: kid.age })} className="edu-family-chip" style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "oklch(0.45 0.15 265 / 0.12)", border: "1px solid oklch(0.45 0.15 265 / 0.3)", color: "oklch(0.78 0.12 265)", transition: "all 0.15s ease" }}>
                    {kid.name || `Child ${i + 1}`}{kid.age > 0 ? `, ${kid.age}` : ""}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 14px" }}>Click to auto-fill</p>
            </>
          )}

          {/* Family Children import */}
          {familyChildren.length > 0 && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>From Family Planning</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
                {familyChildren.map((child) => (
                  <button key={child.id} onClick={() => importFamilyChild(child)} className="edu-family-chip" style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "oklch(0.45 0.15 265 / 0.12)", border: "1px solid oklch(0.45 0.15 265 / 0.3)", color: "oklch(0.78 0.12 265)", transition: "all 0.15s ease" }}>
                    {child.name}, age {child.age}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 14px" }}>Click to auto-fill</p>
            </>
          )}

          {/* Saved Scenarios */}
          {scenarios.length > 0 && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>Saved Scenarios</p>
              {scenarios.map((s) => (
                <div key={s.id} onClick={() => selectEduScenario(s.id)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: activeScenarioId === s.id && editingId == null ? "var(--bg-hover)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{s.name}</div>
                    {s.child_name && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.child_name}, age {s.child_current_age}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, padding: "2px 6px" }}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} disabled={deleting} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 12, padding: "2px 6px" }}>Del</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Scenario Form */}
          <div style={{ height: "1px", background: "var(--border-subtle)", margin: "14px 0" }} />
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 12px" }}>{editingId ? "Edit Scenario" : "Scenario Details"}</p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Scenario Name</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          {[
            { label: "Years in College", field: "years_in_college" as const, min: 1, max: 8, step: 1 },
            { label: "Annual Cost Today ($)", field: "annual_cost_today" as const, min: 0, max: 200000, step: 1000 },
          ].map(({ label, field, min, max, step }) => (
            <div key={field} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input type="number" value={form[field] as number} min={min} max={max} step={step} onChange={(e) => set(field, Number(e.target.value))} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
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
            <input type="number" value={form.current_529_balance} min={0} step={1000} onChange={(e) => set("current_529_balance", Number(e.target.value))} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monthly Contribution ($)</label>
            <input type="number" value={form.monthly_contribution} min={0} step={50} onChange={(e) => set("monthly_contribution", Number(e.target.value))} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
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

          {/* At a Glance — live snapshot */}
          <div style={{ height: "1px", background: "var(--border-subtle, rgba(255,255,255,0.08))", margin: "14px 0 14px" }} />
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>At a Glance</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              {
                label: "Funded",
                value: `${Math.round(Math.min(computed.coveragePct, 100))}%`,
                color: computed.coveragePct >= 100 ? "var(--green)" : computed.coveragePct >= 60 ? "oklch(0.78 0.15 75)" : "var(--red)",
              },
              {
                label: computed.coveragePct >= 100 ? "Surplus" : "Gap",
                value: fmtK(computed.coveragePct >= 100 ? computed.fv529 - computed.effectiveTotalCost : computed.fundingGap),
                color: computed.coveragePct >= 100 ? "var(--green)" : "var(--red)",
              },
              {
                label: "Suggested /mo",
                value: computed.verdictType === "FULLY_FUNDED" ? "On Track" : fmt(computed.suggestedMonthly),
                color: "var(--text-primary)",
              },
              {
                label: "Years Out",
                value: `${computed.yearsUntilCollege} yr${computed.yearsUntilCollege === 1 ? "" : "s"}`,
                color: "var(--text-primary)",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg-card, var(--bg-elevated))", border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>

        </div>{/* end left sidebar */}

        {/* Right panel */}
        <div style={{ flex: 1, padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "14px" }} data-edu-analysis>

          {/* Verdict */}
          <div style={{ background: computed.contextVerdictBg, border: `1px solid ${computed.contextVerdictColor}40`, borderRadius: "var(--radius-lg, 12px)", padding: "20px 24px", animation: "edu-fade-up 0.4s ease-out both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--text-muted)" }}>Atlas</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "99px", background: `${computed.contextVerdictColor}22`, color: computed.contextVerdictColor }}>
                    {computed.contextVerdictSubtitle}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 46, fontWeight: 800, color: computed.contextVerdictColor, letterSpacing: "-1.5px", lineHeight: 1 }}>{computed.contextVerdictLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Confidence</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: computed.contextVerdictColor, fontFamily: "var(--font-mono)" }}>{computed.confidencePct}%</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Funded", value: `${Math.round(Math.min(computed.coveragePct, 100))}%` },
                { label: computed.coveragePct >= 100 ? "Surplus" : "Gap", value: fmtK(computed.coveragePct >= 100 ? computed.fv529 - computed.effectiveTotalCost : computed.fundingGap) },
                { label: "Suggested /mo", value: computed.verdictType === "FULLY_FUNDED" ? "On Track" : fmt(computed.suggestedMonthly) },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--bg-card, var(--bg-elevated))", borderRadius: 8, border: `1px solid ${computed.contextVerdictColor}20` }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: computed.contextVerdictColor, fontFamily: "var(--font-mono)" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {computed.contextVerdictBullets.map(({ positive, text }, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--text-secondary)", animation: `edu-fade-up 0.3s ease-out ${0.1 + i * 0.06}s both` }}>
                  <span style={{ color: positive ? computed.contextVerdictColor : "oklch(0.70 0.18 25)", flexShrink: 0, fontSize: 13 }}>{positive ? "✓" : "⚠"}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div style={{ paddingTop: 12, borderTop: `1px solid ${computed.contextVerdictColor}25`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: forecastStatus?.startsWith("Added") ? "oklch(0.72 0.18 145)" : forecastStatus ? "oklch(0.78 0.15 80)" : "var(--text-muted)" }}>
                {forecastStatus ?? "Add projected college costs to your Life Forecast"}
              </div>
              <button onClick={handleAddEduToForecast} disabled={addingForecast || computed.yearsUntilCollege === 0} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: addingForecast || computed.yearsUntilCollege === 0 ? "not-allowed" : "pointer", opacity: addingForecast || computed.yearsUntilCollege === 0 ? 0.5 : 1, flexShrink: 0 }}>
                {addingForecast ? "Adding…" : "Add to Forecast"}
              </button>
            </div>
          </div>

          {/* Atlas Assessment */}
          <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.05s both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: `${computed.contextVerdictColor}18`, border: `1px solid ${computed.contextVerdictColor}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z" fill={computed.contextVerdictColor}/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Atlas&apos;s Assessment</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Rule-Based Analysis</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, borderLeft: `2px solid color-mix(in oklch, ${computed.contextVerdictColor} 40%, transparent)`, paddingLeft: "12px" }}>{computed.autoNarrative}</p>
          </div>

          {/* What Moves the Needle */}
          {computed.needleLevers.length > 0 && (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.06s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>What Moves the Needle Most</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>Ranked by dollar improvement to your funding gap:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {computed.needleLevers.map(({ label, improvementK, description }, i) => (
                  <div key={label} className="edu-flip-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)", animation: `edu-fade-up 0.28s ease-out ${0.05 + i * 0.06}s both` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{description}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>+{fmtK(improvementK)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact Analysis divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>Impact Analysis</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          </div>

          {/* Ecosystem Impact */}
          {computed.retirProbBefore != null ? (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>Impact Across Your Financial Plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {([
                  { label: "Retirement Probability", value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`, color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 8 ? "oklch(0.70 0.18 25)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 3 ? "oklch(0.78 0.15 80)" : "oklch(0.72 0.18 145)" },
                  { label: "Retirement Assets", value: computed.retirAssetsAfter != null ? fmtK(computed.retirAssetsAfter) : "—", color: "var(--text-secondary)" },
                  { label: "Monthly Savings", value: computed.monthlySavingsAfter != null ? `${fmt(Math.max(0, computed.monthlySavingsBefore ?? 0))} → ${fmt(Math.max(0, computed.monthlySavingsAfter))}` : "—", color: (computed.monthlySavingsAfter ?? 0) < 0 ? "oklch(0.70 0.18 25)" : "var(--text-secondary)" },
                  { label: "529 at Enrollment", value: fmtK(computed.fv529), color: computed.coveragePct >= 100 ? "oklch(0.72 0.18 145)" : computed.coveragePct >= 80 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)" },
                  computed.fiYearsBefore != null && computed.fiYearsAfter != null
                    ? { label: "FI Timeline", value: computed.fiYearsAfter - computed.fiYearsBefore > 0 ? `+${computed.fiYearsAfter - computed.fiYearsBefore} yrs later` : "Unchanged", color: computed.fiYearsAfter - computed.fiYearsBefore > 5 ? "oklch(0.78 0.15 80)" : "oklch(0.72 0.18 145)" }
                    : null,
                ].filter(Boolean) as { label: string; value: string; color: string }[]).map(({ label, value, color }, ei) => (
                  <div key={label} className="edu-eco-tile" style={{ padding: "12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)", animation: `edu-fade-up 0.28s ease-out ${0.05 + ei * 0.04}s both` }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Impact Across Your Financial Plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { label: "529 at Enrollment", value: fmtK(computed.fv529), color: computed.coveragePct >= 100 ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)" },
                  { label: "Funding Gap", value: computed.fundingGap > 0 ? fmtK(computed.fundingGap) : "None", color: computed.fundingGap === 0 ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)" },
                  { label: "Future Annual Cost", value: fmt(computed.futureAnnualCost), color: "var(--text-primary)" },
                  { label: "Total Cost", value: fmtK(computed.effectiveTotalCost), color: "var(--text-primary)" },
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

          {/* Funding Targets */}
          <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out both" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>What Should I Save?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {computed.fundingTargets.map(({ pct, monthly }, i) => {
                const isCurrent = pct === 100;
                return (
                  <div key={pct} className="edu-target-row" onClick={() => set("monthly_contribution", Math.round(monthly / 10) * 10)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: isCurrent ? "oklch(0.45 0.18 250 / 0.08)" : "var(--bg-elevated, var(--bg-base))", border: isCurrent ? "1px solid oklch(0.45 0.18 250 / 0.3)" : "1px solid var(--border)", animation: `edu-fade-up 0.3s ease-out ${0.05 + i * 0.06}s both`, cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-primary)" }}>{pct}% Coverage</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{fmtK(computed.effectiveTotalCost * pct / 100)} of {fmtK(computed.effectiveTotalCost)} target</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-primary)" }}>{fmt(monthly)}/mo</div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0" }}>Click a row to apply that contribution.</p>
          </div>

          {/* Readiness Score */}
          <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Education Readiness Score</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 900, color: computed.readinessScore >= 75 ? "oklch(0.72 0.18 145)" : computed.readinessScore >= 50 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)" }}>{computed.readinessScore}</span>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ 100</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {computed.readinessComponents.map(({ label, score, max }, i) => (
                <div key={label} style={{ animation: `edu-fade-up 0.28s ease-out ${0.1 + i * 0.05}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)" }}>{score}/{max}</span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg-elevated, var(--border-subtle))", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(score / max) * 100}%`, background: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)", borderRadius: 2, transformOrigin: "left", animation: `edu-scale-x 0.5s ease-out ${0.2 + i * 0.06}s both` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 529 Chart */}
          {computed.yearsUntilCollege > 0 ? (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.1s both" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>529 Balance vs College Cost Projection</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{computed.yearsUntilCollege} years to enrollment</div>
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                {[{ label: "529 Balance", color: "#0ea5a0" }, { label: "College Cost Target", color: "#f97316" }].map(({ label, color }) => (
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
                  <Tooltip formatter={(v, name) => typeof v === "number" ? [fmt(v), name] : [String(v ?? ""), name]} contentStyle={{ background: "oklch(0.13 0.01 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: 8, fontSize: 12, color: "oklch(0.92 0.01 240)" }} labelStyle={{ color: "oklch(0.92 0.01 240)", fontWeight: 600, marginBottom: 4 }} itemStyle={{ color: "oklch(0.72 0.04 240)" }} cursor={{ fill: "oklch(0.20 0.01 240 / 0.7)" }} />
                  <Area type="monotone" dataKey="balance" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} name="529 Balance" dot={false} />
                  <Line type="monotone" dataKey="target" stroke="#f97316" strokeWidth={2} strokeDasharray="5 3" name="College Cost" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Child is 18+ — cost projection complete. Current 529 balance: {fmtK(computed.fv529)}.
            </div>
          )}

          {/* Optimizer + Benchmarks */}
          {computed.optimalPlanScore != null && (
            <div data-edu-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
              <div style={{ background: "linear-gradient(135deg, oklch(0.13 0.03 255) 0%, oklch(0.11 0.01 240) 100%)", border: "1px solid oklch(0.45 0.18 250 / 0.2)", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out both" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "oklch(0.65 0.15 250)", boxShadow: "0 0 8px oklch(0.65 0.15 250 / 0.6)" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Retirement vs College Optimizer</p>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>Optimal monthly split to maximize your combined plan score:</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "oklch(0.45 0.18 250 / 0.10)", border: "1px solid oklch(0.45 0.18 250 / 0.25)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.60 0.12 250)", marginBottom: 5 }}>Retirement</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 900, color: "oklch(0.72 0.15 250)" }}>{fmt(computed.optimalRetirMonthly!)}/mo</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "oklch(0.45 0.18 145 / 0.10)", border: "1px solid oklch(0.45 0.18 145 / 0.25)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.60 0.12 145)", marginBottom: 5 }}>529</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 900, color: "oklch(0.72 0.18 145)" }}>{fmt(computed.optimalCollegeMonthly!)}/mo</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ label: "Retire Prob", value: `${computed.optimalRetirProb}%` }, { label: "College Cov", value: `${computed.optimalCollegeCoverage}%` }, { label: "Plan Score", value: `${computed.optimalPlanScore}` }].map(({ label, value }) => (
                    <div key={label} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 7, background: "oklch(0.14 0.01 240)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Compared to National Averages</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>Projected total cost at enrollment ({computed.yearsUntilCollege}yr horizon)</p>
                {(() => {
                  const maxCost = Math.max(...computed.benchmarkContext.map((b) => b.projCost));
                  return computed.benchmarkContext.map((b, i) => (
                    <div key={b.label} style={{ marginBottom: 10, animation: `edu-fade-up 0.25s ease-out ${0.05 + i * 0.04}s both` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: b.isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-secondary)", fontWeight: b.isCurrent ? 700 : 400 }}>{b.label}{b.isCurrent ? " ← You" : ""}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: b.isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-muted)" }}>{fmtK(b.projCost)}</span>
                      </div>
                      <div style={{ height: 5, background: "var(--bg-elevated, var(--border))", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(b.projCost / maxCost) * 100}%`, background: b.isCurrent ? "oklch(0.55 0.18 250)" : "oklch(0.35 0.06 240)", borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Opportunity Cost */}
          {computed.opportunityCostRetirement != null && (
            <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Opportunity Cost Analysis</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>If {fmt(src.monthly_contribution)}/mo were invested for retirement instead:</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ padding: "12px", borderRadius: 8, background: "oklch(0.45 0.18 25 / 0.08)", border: "1px solid oklch(0.45 0.18 25 / 0.2)" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>If Retirement</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.65 0.15 25)" }}>+{fmtK(computed.opportunityCostRetirement)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>at age {profile?.target_retirement_age ?? 65}</div>
                </div>
                <div style={{ padding: "12px", borderRadius: 8, background: "oklch(0.45 0.18 250 / 0.08)", border: "1px solid oklch(0.45 0.18 250 / 0.2)" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>If 529</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.65 0.15 250)" }}>{Math.round(Math.min(computed.coveragePct, 100))}% funded</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>at enrollment</div>
                </div>
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>Tradeoff analysis, not a recommendation.</p>
            </div>
          )}

          {/* Scenario Analysis divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>Scenario Analysis</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          </div>

          {/* Scenario Comparison */}
          <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out both" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Scenario Comparison Center</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>How does your plan compare across common education strategies?</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{["Scenario", "Coverage", "Gap", "Monthly Needed", "Status"].map((h) => (<th key={h} style={{ textAlign: h === "Scenario" ? "left" : "right", padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>))}</tr>
                </thead>
                <tbody>
                  {computed.comparisonRows.map((row, i) => (
                    <tr key={row.label} className="edu-comp-row" style={{ animation: `edu-fade-up 0.25s ease-out ${0.05 + i * 0.04}s both` }}>
                      <td style={{ padding: "10px 10px", color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: i === 0 ? 600 : 400, borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>
                        {i === 0 && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: row.verdictColor, marginRight: 6, verticalAlign: "middle" }} />}
                        {row.label}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: row.verdictColor, borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{row.coveragePct}%</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: row.gap === 0 ? "oklch(0.72 0.18 145)" : "var(--text-secondary)", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{row.gap === 0 ? "None" : fmtK(row.gap)}</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{fmt(row.monthlyNeeded)}/mo</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: `${row.verdictColor}18`, border: `1px solid ${row.verdictColor}35`, color: row.verdictColor, fontWeight: 700 }}>{row.verdictTag}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alt Paths */}
          <div style={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", animation: "edu-fade-up 0.4s ease-out both" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Alternative Education Paths</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>Same 529 balance and contributions applied to each path</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{["Path", "Total Cost", "Coverage", "Gap", "Surplus"].map((h) => (<th key={h} style={{ textAlign: h === "Path" ? "left" : "right", padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>))}</tr>
                </thead>
                <tbody>
                  {computed.altPaths.map((path, i) => {
                    const color = path.coveragePct >= 100 ? "oklch(0.72 0.18 145)" : path.coveragePct >= 80 ? "oklch(0.65 0.15 250)" : path.coveragePct >= 40 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)";
                    const isCurrentPreset = path.key === preset;
                    return (
                      <tr key={path.key} className="edu-comp-row" style={{ animation: `edu-fade-up 0.25s ease-out ${0.05 + i * 0.04}s both`, cursor: "pointer" }} onClick={() => applyPreset(path.key)}>
                        <td style={{ padding: "10px 10px", color: isCurrentPreset ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isCurrentPreset ? 600 : 400, borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>
                          {isCurrentPreset && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 6, verticalAlign: "middle" }} />}
                          {path.label}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{path.totalCost === 0 ? "Free" : fmtK(path.totalCost)}</td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color, borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{path.totalCost === 0 ? "100%" : `${path.coveragePct}%`}</td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: path.gap === 0 ? "oklch(0.72 0.18 145)" : "var(--text-secondary)", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{path.gap === 0 ? "None" : fmtK(path.gap)}</td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: path.surplus > 0 ? "oklch(0.72 0.18 145)" : "var(--text-muted)", borderBottom: "1px solid oklch(0.20 0.01 240 / 0.5)" }}>{path.surplus > 0 ? `+${fmtK(path.surplus)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "10px 0 0" }}>Click a row to apply that path to your calculator.</p>
          </div>

          {/* Atlas Deep Analysis */}
          <div style={{ background: "linear-gradient(145deg, oklch(0.12 0.03 285) 0%, oklch(0.10 0.01 240) 60%, oklch(0.11 0.02 265) 100%)", border: "1px solid oklch(0.45 0.2 285 / 0.2)", borderRadius: "var(--radius-lg, 12px)", padding: "16px 20px", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Atlas Deep Analysis</div>
                <div style={{ fontSize: 10, color: "oklch(0.60 0.12 290)", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Education Advisor</div>
              </div>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              {commentary ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, animation: "edu-fade-up 0.4s ease-out both", borderLeft: "2px solid oklch(0.50 0.25 290 / 0.4)", paddingLeft: "12px" }}>{commentary}</p>
              ) : loadingCommentary ? (
                <AtlasThinking messages={["Modeling tuition inflation…", "Weighing 529 vs Roth…", "Checking financial-aid impact…", "Optimizing the funding timeline…"]} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>Get personalized AI guidance on 529 strategy, tax advantages, investment allocation, and optimal funding timeline.</p>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {["Tax strategy", "Asset allocation", "529 vs Roth", "Aid impact"].map((tag) => (
                      <span key={tag} style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, background: "oklch(0.50 0.2 290 / 0.1)", border: "1px solid oklch(0.50 0.2 290 / 0.2)", color: "oklch(0.65 0.12 290)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={handleGetCommentary} disabled={loadingCommentary} className="edu-finn-btn" style={{ width: "100%", padding: "10px 16px", background: loadingCommentary ? "oklch(0.50 0.2 290 / 0.08)" : "oklch(0.50 0.2 290 / 0.14)", color: "oklch(0.78 0.18 290)", border: `1px solid oklch(0.50 0.2 290 / ${loadingCommentary ? "0.15" : "0.35"})`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loadingCommentary ? "not-allowed" : "pointer", opacity: loadingCommentary ? 0.7 : 1, fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loadingCommentary ? (
                  <><span style={{ width: 12, height: 12, border: "2px solid oklch(0.60 0.15 290)", borderTopColor: "transparent", borderRadius: "50%", animation: "edu-spin 0.7s linear infinite", display: "inline-block" }} />Analyzing…</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z" fill="oklch(0.78 0.18 290)"/></svg>Get Atlas Guidance</>
                )}
              </button>
            </div>
          </div>

        </div>{/* end right panel */}
      </div>{/* end two-column layout */}

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
        .edu-comp-row { transition: background 0.14s ease; }
        .edu-comp-row:hover { background: oklch(0.16 0.02 250 / 0.4); }
        .edu-family-chip:hover { background: oklch(0.50 0.18 265 / 0.2) !important; border-color: oklch(0.50 0.18 265 / 0.5) !important; }
        @media (max-width: 900px) {
          [data-edu-cols] { flex-direction: column !important; }
          [data-edu-sidebar] { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border-subtle) !important; }
          [data-edu-fw] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
