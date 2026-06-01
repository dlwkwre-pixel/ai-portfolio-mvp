"use client";

import { useState, useTransition, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { saveFamilyScenario, deleteFamilyScenario, addFamilyToForecast } from "./family-actions";
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

type ComparisonRow = {
  label: string;
  numKids: number;
  delayYears: number;
  monthlyCost: number;
  retirAssets: number;
  retirProbability: number;
  verdict: VerdictType;
};

type CostSpike = {
  age: number;
  label: string;
  monthlyCost: number;
  yearsAway: number;
  estimated: boolean;
};

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
  // P3 Affordability
  affordabilityScore: number | null;
  affordabilityComponents: { label: string; score: number; max: number; note: string }[];
  // Timing simulator
  timingRows: { label: string; delayYears: number; retirAssets: number }[];
  timingBestDelayLabel: string | null;
  timingBestGain: number;
  // Ecosystem impact
  retirProbBefore: number | null;
  retirProbAfter: number | null;
  homeAffordBefore: number | null;
  homeAffordAfter: number | null;
  fiYearsBefore: number | null;
  fiYearsAfter: number | null;
  emergencyMonths: number | null;
  // P4 flip thresholds
  incomeFlipAmount: number | null;
  childCostFlipReduction: number | null;
  nwFlipAmount: number | null;
  // P6 benchmark
  annualCostVsAvg: { yours: number; national: number; label: string } | null;
  // P7 auto narrative
  autoNarrative: string | null;
  // P8 cost spikes
  costSpikes: CostSpike[];
  // P9 comparison
  comparisonRows: ComparisonRow[];
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

function computeVerdictType(
  income: number, expenses: number, childCost: number,
  nw: number, r: number, n: number,
): VerdictType {
  const savBefore = income - expenses;
  const savAfter = income - expenses - childCost;
  const probB = retirProb(fvCalc(nw, Math.max(0, savBefore), n, r), expenses);
  const probA = retirProb(fvCalc(nw, Math.max(0, savAfter), n, r), expenses);
  const drop = probB - probA;
  if (savAfter < 0) return "HIGH_STRAIN";
  if (drop > 15 || (savAfter >= 0 && savAfter < childCost * 0.5)) return "WAIT";
  if (income > 0 && childCost < income * 0.05 && drop < 5) return "LOW_IMPACT";
  return "READY";
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
  numChildren: number,
): ComputedFamily {
  function costAtAge(age: number) {
    if (age < 3) return monthlyInfant;
    if (age <= 12) return monthlyChild;
    if (age <= 17) return monthlyTeen;
    return 0;
  }

  const baseMonthlyImpact = costAtAge(childCurrentAge);
  const currentMonthlyImpact = baseMonthlyImpact * numChildren;
  let baseTotalCost = 0;
  for (let age = childCurrentAge; age < 18; age++) baseTotalCost += costAtAge(age) * 12;
  const totalCostToAge18 = baseTotalCost * numChildren;
  const remainingYears = Math.max(0, 18 - childCurrentAge);

  const chartData: PhaseBar[] = [];
  for (let age = childCurrentAge; age < 18; age++) {
    const phase: "Infant" | "Child" | "Teen" = age < 3 ? "Infant" : age <= 12 ? "Child" : "Teen";
    chartData.push({ age, annualCost: costAtAge(age) * 12 * numChildren, phase, fill: PHASE_COLORS[phase] });
  }

  // P6: National benchmark (USDA ~$16,500/yr per child)
  const NATIONAL_ANNUAL = 16500;
  const yourAnnual = baseMonthlyImpact * 12;
  const annualCostVsAvg = baseMonthlyImpact > 0 ? {
    yours: yourAnnual,
    national: NATIONAL_ANNUAL,
    label: yourAnnual < NATIONAL_ANNUAL * 0.85 ? "Below Average" : yourAnnual <= NATIONAL_ANNUAL * 1.15 ? "Average" : "Above Average",
  } : null;

  // P8: Cost spikes
  const costSpikes: CostSpike[] = [];
  if (childCurrentAge <= 2 && monthlyInfant >= 500) {
    costSpikes.push({ age: 0, label: "Daycare", monthlyCost: monthlyInfant * numChildren, yearsAway: 0, estimated: false });
  }
  if (childCurrentAge < 13 && monthlyTeen - monthlyChild >= 200) {
    costSpikes.push({ age: 13, label: "Teen phase increase", monthlyCost: (monthlyTeen - monthlyChild) * numChildren, yearsAway: 13 - childCurrentAge, estimated: false });
  }
  if (childCurrentAge < 16) {
    costSpikes.push({ age: 16, label: "Vehicle & insurance", monthlyCost: 350 * numChildren, yearsAway: 16 - childCurrentAge, estimated: true });
  }
  if (childCurrentAge < 18) {
    costSpikes.push({ age: 18, label: "College", monthlyCost: 2500 * numChildren, yearsAway: 18 - childCurrentAge, estimated: true });
  }

  const noProfile: ComputedFamily = {
    currentMonthlyImpact, totalCostToAge18, remainingYears, chartData,
    monthlySavingsBefore: null, monthlySavingsAfter: null,
    projectedNWBefore: null, projectedNWAfter: null,
    verdict: null, verdictConfidence: "Low", verdictReasons: ["Add profile data for analysis"],
    readinessScore: null, readinessComponents: [],
    affordabilityScore: null, affordabilityComponents: [],
    timingRows: [], timingBestDelayLabel: null, timingBestGain: 0,
    retirProbBefore: null, retirProbAfter: null,
    homeAffordBefore: null, homeAffordAfter: null,
    fiYearsBefore: null, fiYearsAfter: null, emergencyMonths: null,
    incomeFlipAmount: null, childCostFlipReduction: null, nwFlipAmount: null,
    annualCostVsAvg, autoNarrative: null, costSpikes, comparisonRows: [],
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

  const probBefore = retirProb(projectedNWBefore, baseExpenses);
  const probAfter = retirProb(projectedNWAfter, baseExpenses);
  const retirDrop = probBefore - probAfter;
  const isStrained = savingsAfter < 0;
  const isTight = savingsAfter >= 0 && savingsAfter < currentMonthlyImpact * 0.5;
  const isLowImpact = monthlyIncome > 0 && currentMonthlyImpact < monthlyIncome * 0.05 && retirDrop < 5;
  const efMonthsBase = baseExpenses > 0 ? liquidAssets / baseExpenses : 0;
  const totalExpWithChild = baseExpenses + currentMonthlyImpact;
  const efMonthsWithChild = totalExpWithChild > 0 ? liquidAssets / totalExpWithChild : 0;

  // P1: Verdict (specific reasons with actual numbers)
  let verdict: VerdictType;
  let verdictConfidence: string;
  let verdictReasons: string[];

  if (isStrained) {
    verdict = "HIGH_STRAIN";
    verdictConfidence = "Strong";
    const deficit = Math.abs(savingsAfter);
    verdictReasons = [
      `Child costs create a ${fmt(deficit)}/mo cash flow deficit`,
      efMonthsWithChild > 0
        ? `Emergency fund covers ~${efMonthsWithChild.toFixed(1)} months at new spending level`
        : "Emergency fund would erode quickly without surplus",
      retirDrop > 5
        ? `Retirement probability drops ${retirDrop}pp to ${probAfter}%`
        : `Retirement probability: ${probBefore}% → ${probAfter}%`,
    ];
  } else if (retirDrop > 15 || isTight) {
    verdict = "WAIT";
    verdictConfidence = retirDrop > 15 ? "Strong" : "Good";
    verdictReasons = [
      retirDrop > 15
        ? `Retirement probability drops ${retirDrop}pp: ${probBefore}% → ${probAfter}% (target: 80%+)`
        : `Cash flow buffer of ${fmt(savingsAfter)}/mo is under 50% of child cost`,
      isTight
        ? `${fmt(savingsAfter)}/mo leaves little room for unexpected expenses`
        : "Waiting builds retirement assets and reduces the probability gap",
      efMonthsBase >= 6
        ? `Emergency fund covers ${efMonthsBase.toFixed(1)} months currently`
        : `Emergency fund: ${efMonthsBase.toFixed(1)} months — below 6-month target`,
    ];
  } else if (isLowImpact) {
    verdict = "LOW_IMPACT";
    verdictConfidence = "Good";
    const costPct = (currentMonthlyImpact / monthlyIncome * 100).toFixed(1);
    verdictReasons = [
      `Child costs are ${costPct}% of household income — well within comfortable range`,
      `Retirement probability: ${probBefore}% → ${probAfter}% (${retirDrop < 2 ? "minimal change" : `${retirDrop}pp change`})`,
      efMonthsWithChild >= 6
        ? `Emergency fund covers ${efMonthsWithChild.toFixed(1)} months including child costs`
        : `Emergency fund: ${efMonthsWithChild.toFixed(1)} months with child costs — consider building further`,
    ];
  } else {
    verdict = "READY";
    verdictConfidence = retirDrop < 5 ? "Strong" : "Good";
    verdictReasons = [
      `Retirement probability: ${probBefore}% → ${probAfter}% (${retirDrop < 5 ? "on track, minimal impact" : `${retirDrop}pp — manageable`})`,
      savingsAfter > 0
        ? `Monthly buffer of ${fmt(savingsAfter)}/mo after all child costs`
        : "Cash flow is tight but positive",
      efMonthsWithChild >= 6
        ? `Emergency fund covers ${efMonthsWithChild.toFixed(1)} months including child costs`
        : efMonthsBase >= 6
        ? `Emergency fund: ${efMonthsBase.toFixed(1)} months (${efMonthsWithChild.toFixed(1)}mo with child costs)`
        : `Emergency fund: ${efMonthsBase.toFixed(1)} months — work toward 6 months`,
    ];
  }

  // P2: Readiness score
  const efScore = Math.min(20, (efMonthsBase / 6) * 20);
  const cfRatio = monthlyIncome > 0 ? Math.max(0, savingsAfter) / monthlyIncome : 0;
  const cfScore = Math.min(20, cfRatio * 100);
  const targetNW = baseExpenses * 12 * 25;
  const retirScore = targetNW > 0 ? Math.min(20, (projectedNWAfter / targetNW) * 20) : 10;
  const coverScore = currentMonthlyImpact > 0 && savingsAfter > 0
    ? Math.min(20, (savingsAfter / currentMonthlyImpact) * 10) : 0;
  const bufferScore = savingsBefore > 0
    ? Math.min(20, (Math.max(0, savingsAfter) / savingsBefore) * 20) : 0;
  const readinessComponents = [
    { label: "Emergency Fund Strength", score: Math.round(efScore), max: 20 },
    { label: "Monthly Cash Flow", score: Math.round(cfScore), max: 20 },
    { label: "Retirement Progress", score: Math.round(retirScore), max: 20 },
    { label: "Child Cost Coverage", score: Math.round(coverScore), max: 20 },
    { label: "Income Buffer", score: Math.round(bufferScore), max: 20 },
  ];
  const readinessScore = readinessComponents.reduce((s, c) => s + c.score, 0);

  // P3: Affordability Score (distinct from Readiness)
  const costToIncomeRatio = monthlyIncome > 0 ? currentMonthlyImpact / monthlyIncome : 1;
  const aff1 = costToIncomeRatio <= 0.05 ? 20 : costToIncomeRatio <= 0.10 ? 16 : costToIncomeRatio <= 0.15 ? 12 : costToIncomeRatio <= 0.20 ? 8 : costToIncomeRatio <= 0.25 ? 4 : 0;
  const surplusRatio = monthlyIncome > 0 ? savingsAfter / monthlyIncome : -1;
  const aff2 = surplusRatio >= 0.25 ? 20 : surplusRatio >= 0.15 ? 16 : surplusRatio >= 0.10 ? 12 : surplusRatio >= 0.05 ? 8 : surplusRatio >= 0 ? 4 : 0;
  const aff3 = efMonthsWithChild >= 6 ? 20 : efMonthsWithChild >= 4 ? 15 : efMonthsWithChild >= 3 ? 10 : efMonthsWithChild >= 2 ? 5 : 0;
  const costToNWRatio = currentNetWorth > 0 ? totalCostToAge18 / currentNetWorth : 10;
  const aff4 = costToNWRatio <= 0.3 ? 20 : costToNWRatio <= 0.5 ? 16 : costToNWRatio <= 0.8 ? 12 : costToNWRatio <= 1.2 ? 8 : costToNWRatio <= 2.0 ? 4 : 0;
  const aff5 = probAfter >= 90 ? 20 : probAfter >= 80 ? 16 : probAfter >= 70 ? 12 : probAfter >= 60 ? 8 : probAfter >= 50 ? 4 : 0;
  const affordabilityComponents = [
    { label: "Cost-to-Income", score: Math.round(aff1), max: 20, note: `${(costToIncomeRatio * 100).toFixed(1)}% of income` },
    { label: "Monthly Surplus", score: Math.round(aff2), max: 20, note: `${fmt(savingsAfter)}/mo after all costs` },
    { label: "Emergency Coverage", score: Math.round(aff3), max: 20, note: `${efMonthsWithChild.toFixed(1)}mo with child costs` },
    { label: "18-Year Cost vs NW", score: Math.round(aff4), max: 20, note: `${fmtK(totalCostToAge18)} vs ${fmtK(currentNetWorth)} NW` },
    { label: "Retirement Continuity", score: Math.round(aff5), max: 20, note: `${probAfter}% retirement prob` },
  ];
  const affordabilityScore = affordabilityComponents.reduce((s, c) => s + c.score, 0);

  // Timing simulator
  const timingOptions = [
    { label: "Now", delayYears: 0 },
    { label: "1 Year", delayYears: 1 },
    { label: "2 Years", delayYears: 2 },
    { label: "3 Years", delayYears: 3 },
    { label: "5 Years", delayYears: 5 },
  ];
  const timingRows = timingOptions.map(({ label, delayYears }) => ({
    label, delayYears,
    retirAssets: Math.max(0, computeTimingNW(delayYears, currentNetWorth, savingsBefore, savingsAfter, yearsToRetirement, r)),
  }));
  const nowAssets = timingRows[0].retirAssets;
  const bestTiming = timingRows.slice(1).reduce((best, row) => row.retirAssets > best.retirAssets ? row : best, timingRows[1]);
  const timingBestGain = bestTiming.retirAssets - nowAssets;
  const timingBestDelayLabel = timingBestGain > 10_000 ? bestTiming.label : null;

  // Ecosystem impact
  const homeAffordBefore = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - baseExpenses) * 0.28) / MORTGAGE_FACTOR : null;
  const homeAffordAfter = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - baseExpenses - currentMonthlyImpact) * 0.28) / MORTGAGE_FACTOR : null;
  const fiTarget = baseExpenses * 12 * 25;
  const fiYearsBefore = yearsToFI(currentNetWorth, Math.max(0, savingsBefore), fiTarget, r);
  const fiYearsAfter = yearsToFI(currentNetWorth, Math.max(0, savingsAfter), fiTarget, r);
  const emergencyMonths = baseExpenses > 0 ? liquidAssets / baseExpenses : null;

  // P4: Binary search — what would flip the verdict to READY?
  let incomeFlipAmount: number | null = null;
  let childCostFlipReduction: number | null = null;
  let nwFlipAmount: number | null = null;

  if (verdict !== "READY" && verdict !== "LOW_IMPACT") {
    // Min income increase
    if (monthlyIncome > 0) {
      let lo = 0, hi = 20000;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const v2 = computeVerdictType(monthlyIncome + mid, baseExpenses, currentMonthlyImpact, currentNetWorth, r, n);
        if (v2 === "READY" || v2 === "LOW_IMPACT") hi = mid; else lo = mid;
      }
      incomeFlipAmount = hi < 19000 ? Math.ceil(hi / 50) * 50 : null;
    }
    // Max child cost reduction
    if (currentMonthlyImpact > 0) {
      let lo = 0, hi = currentMonthlyImpact;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const v2 = computeVerdictType(monthlyIncome, baseExpenses, currentMonthlyImpact - mid, currentNetWorth, r, n);
        if (v2 === "READY" || v2 === "LOW_IMPACT") hi = mid; else lo = mid;
      }
      childCostFlipReduction = hi < currentMonthlyImpact * 0.99 ? Math.ceil(hi / 50) * 50 : null;
    }
    // Min NW increase (only meaningful for WAIT where retirDrop drives the verdict)
    if (verdict === "WAIT") {
      let lo = currentNetWorth, hi = currentNetWorth + 3_000_000;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const v2 = computeVerdictType(monthlyIncome, baseExpenses, currentMonthlyImpact, mid, r, n);
        if (v2 === "READY" || v2 === "LOW_IMPACT") hi = mid; else lo = mid;
      }
      nwFlipAmount = hi < currentNetWorth + 2_900_000 ? Math.ceil((hi - currentNetWorth) / 5000) * 5000 : null;
    }
  }

  // P7: Auto FINN Narrative (rule-based, always computed)
  let autoNarrative: string | null = null;
  {
    const timingNote = timingBestDelayLabel && timingBestGain > 10_000
      ? ` Waiting ${timingBestDelayLabel.toLowerCase()} would add ${fmtK(timingBestGain)} in retirement assets.`
      : "";
    const efNote = efMonthsWithChild >= 6
      ? ` Emergency fund covers ${efMonthsWithChild.toFixed(1)} months at the new spending level.`
      : ` Emergency fund covers ${efMonthsWithChild.toFixed(1)} months with child costs — ${efMonthsWithChild < 3 ? "prioritize building this before proceeding" : "consider strengthening before proceeding"}.`;

    if (verdict === "READY") {
      autoNarrative = `Your financial profile supports having a child now. Retirement probability stays at ${probAfter}% and you maintain a ${fmt(savingsAfter)}/mo buffer after all costs.${efNote}${timingNote}`;
    } else if (verdict === "HIGH_STRAIN") {
      const deficit = Math.abs(savingsAfter);
      const fix = incomeFlipAmount
        ? ` Increasing income by ${fmt(incomeFlipAmount)}/mo${childCostFlipReduction ? ` or reducing child costs by ${fmt(childCostFlipReduction)}/mo` : ""} would flip the verdict.`
        : "";
      autoNarrative = `Child costs would exceed available cash flow by ${fmt(deficit)}/mo, creating an ongoing deficit.${fix}${efNote}`;
    } else if (verdict === "WAIT") {
      const dropNote = retirDrop > 15
        ? `a ${retirDrop}pp retirement probability drop (${probBefore}% → ${probAfter}%)`
        : `a thin cash flow buffer of ${fmt(savingsAfter)}/mo`;
      const fix = incomeFlipAmount
        ? ` To proceed now: ${fmt(incomeFlipAmount)}/mo additional income${nwFlipAmount ? ` or ${fmtK(nwFlipAmount)} more in net worth` : ""} would change this.`
        : "";
      autoNarrative = `Waiting is recommended due to ${dropNote}.${fix}${timingNote}`;
    } else if (verdict === "LOW_IMPACT") {
      const costPct = (currentMonthlyImpact / monthlyIncome * 100).toFixed(1);
      autoNarrative = `Child costs are ${costPct}% of your income — a low burden by any measure. Retirement probability shifts only from ${probBefore}% to ${probAfter}%. Your financial plan absorbs this comfortably.${efNote}`;
    }
  }

  // P9: Comparison rows
  function makeRow(label: string, delay: number, kids: number): ComparisonRow {
    const kidCost = baseMonthlyImpact * kids;
    const savA = monthlyIncome - baseExpenses - kidCost;
    const ra = Math.max(0, computeTimingNW(delay, currentNetWorth, savingsBefore, savA, yearsToRetirement, r));
    const prob = retirProb(ra, baseExpenses);
    const v = computeVerdictType(monthlyIncome, baseExpenses, kidCost, currentNetWorth, r, n);
    return { label, numKids: kids, delayYears: delay, monthlyCost: kidCost, retirAssets: ra, retirProbability: prob, verdict: v };
  }

  const comparisonRows: ComparisonRow[] = [
    makeRow("Child Now", 0, 1),
    makeRow("Child in 2 Years", 2, 1),
    makeRow("Child in 5 Years", 5, 1),
    makeRow("Two Children", 0, 2),
    makeRow("Three Children", 0, 3),
  ];

  return {
    currentMonthlyImpact, totalCostToAge18, remainingYears, chartData,
    monthlySavingsBefore: savingsBefore, monthlySavingsAfter: savingsAfter,
    projectedNWBefore, projectedNWAfter,
    verdict, verdictConfidence, verdictReasons,
    readinessScore, readinessComponents,
    affordabilityScore, affordabilityComponents,
    timingRows, timingBestDelayLabel, timingBestGain,
    retirProbBefore: probBefore, retirProbAfter: probAfter,
    homeAffordBefore, homeAffordAfter,
    fiYearsBefore, fiYearsAfter, emergencyMonths,
    incomeFlipAmount, childCostFlipReduction, nwFlipAmount,
    annualCostVsAvg, autoNarrative, costSpikes, comparisonRows,
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
  const [numChildren, setNumChildren] = useState<1 | 2 | 3 | 4>(1);
  const [addingForecast, startAddForecast] = useTransition();
  const [forecastStatus, setForecastStatus] = useState<string | null>(null);

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
      numChildren,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, activeScenario, editingId, profile, currentNetWorth, liquidAssets, numChildren]);

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
      ? profile.target_retirement_age - profile.current_age : null;
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

  function handleAddFamilyToForecast() {
    startAddForecast(async () => {
      const fv = getFormValues();
      const result = await addFamilyToForecast({
        childName: fv.child_name || "Child",
        childCurrentAge: fv.child_current_age,
        monthlyInfantCost: fv.monthly_infant_cost,
        monthlyChildCost: fv.monthly_child_cost,
        monthlyTeenCost: fv.monthly_teen_cost,
        currentYear: new Date().getFullYear(),
      });
      if (result.error) {
        setForecastStatus(result.error);
      } else if (result.added === 0) {
        setForecastStatus("No years to add (child is 18+).");
      } else {
        setForecastStatus(`Added ${result.added} events to your Life Forecast.`);
      }
    });
  }

  const v = getFormValues();
  const costImpactPct = v.monthly_expenses_now > 0
    ? (computed.currentMonthlyImpact / v.monthly_expenses_now * 100).toFixed(0) : "0";
  const retirementImpact = computed.projectedNWBefore != null && computed.projectedNWAfter != null
    ? computed.projectedNWBefore - computed.projectedNWAfter : null;

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

      {/* P1: Verdict card */}
      {meta && computed.verdict && (
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ ...cardS, background: meta.bg, borderColor: meta.border }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 900, letterSpacing: "0.04em", color: meta.color }}>
                    {computed.verdict === "WAIT" && computed.timingBestDelayLabel
                      ? `WAIT ${computed.timingBestDelayLabel.toUpperCase()}`
                      : meta.label}
                  </span>
                  <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "var(--radius-sm, 4px)", border: `1px solid ${meta.border}`, color: meta.color }}>
                    {computed.verdictConfidence} Conviction
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {computed.verdictReasons.map((reason, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
                      <span style={{ color: meta.color, fontSize: "12px", marginTop: "1px", flexShrink: 0 }}>
                        {computed.verdict === "HIGH_STRAIN" ? "✕" : "✓"}
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
              {computed.readinessScore != null && (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "36px", fontWeight: 900, color: meta.color, lineHeight: 1 }}>{computed.readinessScore}</div>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginTop: "3px" }}>Readiness</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: meta.color, marginTop: "2px" }}>/ 100</div>
                </div>
              )}
            </div>
            {/* Stats row */}
            {computed.retirProbBefore != null && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${meta.border}` }}>
                {[
                  {
                    label: "Retirement Probability",
                    value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`,
                    sub: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 0 ? `-${computed.retirProbBefore - (computed.retirProbAfter ?? 0)}pp` : "No change",
                    color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 10 ? "var(--red)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 5 ? "var(--amber)" : "var(--green)",
                  },
                  {
                    label: "Monthly Cash Flow",
                    value: computed.monthlySavingsAfter != null ? (computed.monthlySavingsAfter >= 0 ? "+" : "") + fmt(computed.monthlySavingsAfter) + "/mo" : "—",
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
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary, var(--text-muted))", marginTop: "1px" }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Add to Forecast */}
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: forecastStatus?.startsWith("Added") ? "var(--green)" : forecastStatus ? "var(--amber)" : "var(--text-muted)" }}>
                {forecastStatus ?? "Add child costs to your Life Forecast"}
              </div>
              <button
                onClick={handleAddFamilyToForecast}
                disabled={addingForecast || computed.remainingYears === 0}
                style={{
                  padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: "var(--accent)", color: "#fff", border: "none",
                  cursor: addingForecast || computed.remainingYears === 0 ? "not-allowed" : "pointer",
                  opacity: addingForecast || computed.remainingYears === 0 ? 0.5 : 1, flexShrink: 0,
                }}
              >
                {addingForecast ? "Adding…" : "Add to Forecast"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* P6: National Benchmark + P8: Cost Spikes */}
      {(computed.annualCostVsAvg || computed.costSpikes.length > 0) && (
        <div style={{ padding: "10px 24px 0", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {computed.annualCostVsAvg && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--card-border, var(--border))", borderRadius: "var(--radius-md, 8px)", fontSize: "12px" }}>
              <span style={{ color: "var(--text-muted)" }}>vs National Avg</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: computed.annualCostVsAvg.label === "Above Average" ? "var(--amber)" : computed.annualCostVsAvg.label === "Below Average" ? "var(--green)" : "var(--text-primary)" }}>
                {fmtK(computed.annualCostVsAvg.yours)}/yr
              </span>
              <span style={{ color: "var(--text-tertiary, var(--text-muted))", fontSize: "10px" }}>
                ({computed.annualCostVsAvg.label}, nat. avg {fmtK(computed.annualCostVsAvg.national)}/yr)
              </span>
            </div>
          )}
          {computed.costSpikes.map((spike) => (
            <div key={spike.age} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 12px", background: "color-mix(in oklch, oklch(0.60 0.14 80) 6%, var(--card-bg, var(--bg-card)))", border: "1px solid color-mix(in oklch, oklch(0.60 0.14 80) 20%, transparent)", borderRadius: "var(--radius-md, 8px)", fontSize: "12px" }}>
              <span style={{ fontSize: "10px", color: "oklch(0.78 0.15 80)" }}>▲</span>
              <span style={{ color: "var(--text-secondary)" }}>{spike.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "oklch(0.78 0.15 80)" }}>
                {spike.yearsAway === 0 ? "Active" : `Age ${spike.age}`}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>+{fmt(spike.monthlyCost)}/mo{spike.estimated ? " est." : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid: left + right */}
      <div data-family-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 320px) 1fr", gap: "20px", padding: "16px 24px 8px", alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Number of children selector */}
          <div style={{ ...cardS, background: "linear-gradient(135deg, oklch(0.13 0.02 240) 0%, oklch(0.11 0.01 240) 100%)", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "oklch(0.55 0.15 265 / 0.06)", pointerEvents: "none" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.65 0.12 265)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
              Planning For
            </div>
            <div style={{ display: "flex", gap: "8px", position: "relative" }}>
              {([1, 2, 3, 4] as const).map((n) => {
                const active = numChildren === n;
                const icons = ["👶", "👶👶", "👶👶👶", "👨‍👩‍👧‍👦"];
                const label = n === 4 ? "4+" : String(n);
                return (
                  <button
                    key={n}
                    onClick={() => setNumChildren(n)}
                    className="bt-child-btn"
                    style={{
                      flex: 1, padding: "10px 0 8px", borderRadius: 10, cursor: "pointer",
                      background: active ? "oklch(0.55 0.15 265 / 0.18)" : "oklch(0.14 0.01 240)",
                      border: active ? "1px solid oklch(0.55 0.15 265 / 0.55)" : "1px solid oklch(0.22 0.02 240)",
                      boxShadow: active ? "0 0 14px oklch(0.55 0.15 265 / 0.25), inset 0 1px 0 oklch(0.75 0.1 265 / 0.1)" : "none",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      transition: "all 0.18s ease",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    <span style={{ fontSize: n === 3 ? 12 : n === 4 ? 11 : 14, lineHeight: 1 }}>{icons[n - 1]}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: active ? "oklch(0.85 0.12 265)" : "var(--text-secondary)", fontFamily: "var(--font-mono)", transition: "color 0.18s ease" }}>{label}</span>
                    <span style={{ fontSize: 9, color: active ? "oklch(0.65 0.1 265)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", transition: "color 0.18s ease" }}>{n === 1 ? "child" : n === 4 ? "or more" : "children"}</span>
                  </button>
                );
              })}
            </div>
            {numChildren > 1 && (
              <div style={{ fontSize: 11, color: "oklch(0.55 0.1 265)", marginTop: 10, padding: "6px 10px", background: "oklch(0.55 0.15 265 / 0.06)", borderRadius: 6, border: "1px solid oklch(0.55 0.15 265 / 0.12)" }}>
                All costs scaled to {numChildren} {numChildren === 4 ? "or more" : ""} children
              </div>
            )}
          </div>

          {/* Saved scenarios */}
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
                    <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, padding: "2px 6px" }}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} disabled={deleting} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red, #ef4444)", fontSize: 12, padding: "2px 6px" }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New / Edit form */}
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
                <input type={type} value={form[field] as string} onChange={(e) => set(field, e.target.value)} style={inputS} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={labelS}>Child Current Age</label>
              <input type="number" value={form.child_current_age} min={0} max={17} step={1} onChange={(e) => set("child_current_age", Number(e.target.value))} style={{ ...inputS, fontFamily: "var(--font-mono)" }} />
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
                <input type="range" min={0} max={5000} step={50} value={form[field] as number} onChange={(e) => set(field, Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
              </div>
            ))}
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 8px" }}>
              Household Context
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelS}>Monthly Household Expenses ($)</label>
              <input type="number" value={form.monthly_expenses_now} min={0} step={100} onChange={(e) => set("monthly_expenses_now", Number(e.target.value))} style={{ ...inputS, fontFamily: "var(--font-mono)" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Investment Return</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{pct(form.investment_return * 100)}</span>
              </div>
              <input type="range" min={0.03} max={0.12} step={0.005} value={form.investment_return} onChange={(e) => set("investment_return", Number(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--accent)" }} />
            </div>
            {saveStatus && (
              <div style={{ fontSize: 12, color: saveStatus === "Saved." ? "var(--green, #22c55e)" : "var(--red, #ef4444)", marginBottom: 8 }}>{saveStatus}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "9px 0", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : editingId ? "Update" : "Save Scenario"}
              </button>
              {editingId && (
                <button onClick={cancelEdit} style={{ padding: "9px 14px", background: "var(--bg-elevated, var(--bg-hover))", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* P7: Auto FINN Narrative */}
          {computed.autoNarrative && meta && (
            <div style={{ ...cardS, borderColor: meta.border, background: `color-mix(in oklch, ${meta.color} 4%, var(--card-bg, var(--bg-card)))` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke={meta.color} strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke={meta.color} strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill={meta.color} />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>FINN Assessment</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                {computed.autoNarrative}
              </p>
            </div>
          )}

          {/* P4: What Would Change The Verdict? */}
          {computed.verdict && computed.verdict !== "READY" && computed.verdict !== "LOW_IMPACT" && (computed.incomeFlipAmount || computed.childCostFlipReduction || computed.nwFlipAmount) && (
            <div style={cardS}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>What Would Change The Verdict?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {computed.incomeFlipAmount != null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--card-border, var(--border))" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: 18, color: "var(--text-muted)" }}>↑</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Increase monthly income by</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>salary, side income, or partner income</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>{fmt(computed.incomeFlipAmount)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>/mo → READY</div>
                    </div>
                  </div>
                )}
                {computed.childCostFlipReduction != null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--card-border, var(--border))" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: 18, color: "var(--text-muted)" }}>↓</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Reduce child costs by</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>daycare, school choice, shared costs</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>{fmt(computed.childCostFlipReduction)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>/mo → READY</div>
                    </div>
                  </div>
                )}
                {computed.nwFlipAmount != null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--card-border, var(--border))" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: 18, color: "var(--text-muted)" }}>◎</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Build net worth by</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>lowers retirement probability gap</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>{fmtK(computed.nwFlipAmount)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>savings → READY</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: score >= max * 0.7 ? "var(--green)" : score >= max * 0.4 ? "var(--amber)" : "var(--red)" }}>{score}/{max}</span>
                    </div>
                    <div style={{ height: "4px", background: "var(--bg-elevated, var(--border-subtle))", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(score / max) * 100}%`, background: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)", borderRadius: "2px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* P3: Affordability Score */}
          {computed.affordabilityScore != null && meta && (
            <div style={cardS}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Family Affordability Score</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 900, color: meta.color }}>{computed.affordabilityScore}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ 100</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {computed.affordabilityComponents.map(({ label, score, max, note }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "6px" }}>{note}</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: score >= max * 0.7 ? "var(--green)" : score >= max * 0.4 ? "var(--amber)" : "var(--red)" }}>{score}/{max}</span>
                    </div>
                    <div style={{ height: "4px", background: "var(--bg-elevated, var(--border-subtle))", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(score / max) * 100}%`, background: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)", borderRadius: "2px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Full-width analysis below the grid ──────────────────────────────── */}
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Row 1: Timing Simulator + Ecosystem Impact */}
        {(computed.timingRows.length > 0 || computed.retirProbBefore != null) && (
          <div data-family-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>

            {computed.timingRows.length > 0 && (
              <div className="bt-card" style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out both" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>When Are You Planning to Have a Child?</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {computed.timingRows.map(({ label, delayYears, retirAssets }, ti) => {
                    const isNow = delayYears === 0;
                    const gain = retirAssets - computed.timingRows[0].retirAssets;
                    const isBest = !isNow && gain === computed.timingBestGain && computed.timingBestGain > 10_000;
                    return (
                      <div key={label} className="bt-timing-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md, 8px)", background: isBest ? "color-mix(in oklch, oklch(0.55 0.15 145) 8%, var(--bg-elevated, transparent))" : "var(--bg-elevated, var(--bg-card))", border: `1px solid ${isBest ? "color-mix(in oklch, oklch(0.55 0.15 145) 25%, transparent)" : "var(--card-border, var(--border))"}`, animation: `bt-fade-up 0.3s ease-out ${0.05 + ti * 0.06}s both` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {isBest && <span style={{ fontSize: "9px", fontWeight: 700, color: "oklch(0.72 0.18 145)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Best</span>}
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

            {computed.retirProbBefore != null && (
              <div style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out 0.08s both" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>Impact Across Your Financial Plan</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                  {[
                    { label: "Retirement Probability", value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`, sub: "on track for retirement", icon: "◎", color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 10 ? "var(--red)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 5 ? "var(--amber)" : "var(--green)" },
                    { label: "Home Affordability", value: computed.homeAffordBefore != null && computed.homeAffordAfter != null ? `${fmtK(computed.homeAffordBefore)} → ${fmtK(computed.homeAffordAfter)}` : "—", sub: "max home (28% DTI)", icon: "⌂", color: computed.homeAffordBefore != null && computed.homeAffordAfter != null && computed.homeAffordBefore - computed.homeAffordAfter > 50_000 ? "var(--amber)" : "var(--green)" },
                    { label: "Monthly Savings", value: computed.monthlySavingsAfter != null ? `${fmt(Math.max(0, computed.monthlySavingsBefore ?? 0))}/mo → ${fmt(Math.max(0, computed.monthlySavingsAfter))}/mo` : "—", sub: "household savings rate", icon: "$", color: (computed.monthlySavingsAfter ?? 0) >= 0 ? "var(--text-secondary)" : "var(--red)" },
                    { label: "Emergency Fund", value: computed.emergencyMonths != null ? `${computed.emergencyMonths.toFixed(1)} months` : "—", sub: computed.emergencyMonths != null ? computed.emergencyMonths >= 6 ? "Adequate" : computed.emergencyMonths >= 3 ? "Thin" : "Low" : "current", icon: "⛨", color: computed.emergencyMonths != null ? computed.emergencyMonths >= 6 ? "var(--green)" : computed.emergencyMonths >= 3 ? "var(--amber)" : "var(--red)" : "var(--text-muted)" },
                    { label: "Financial Independence", value: computed.fiYearsBefore != null && computed.fiYearsAfter != null ? computed.fiYearsAfter - computed.fiYearsBefore > 0 ? `+${computed.fiYearsAfter - computed.fiYearsBefore} years later` : "Same timeline" : computed.fiYearsAfter === null ? "Extended" : "—", sub: "to FI (25x expenses)", icon: "→", color: computed.fiYearsAfter != null && computed.fiYearsBefore != null && computed.fiYearsAfter - computed.fiYearsBefore > 5 ? "var(--amber)" : "var(--text-secondary)" },
                    { label: "Retirement Assets", value: retirementImpact != null ? "-" + fmtK(retirementImpact) : "—", sub: "vs no child costs", icon: "▲", color: (retirementImpact ?? 0) > 1_000_000 ? "var(--red)" : (retirementImpact ?? 0) > 300_000 ? "var(--amber)" : "var(--text-secondary)" },
                  ].map(({ label, value, sub, icon, color }, ei) => (
                    <div key={label} className="bt-eco-tile" style={{ padding: "12px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--card-border, var(--border))", animation: `bt-fade-up 0.28s ease-out ${0.05 + ei * 0.04}s both` }}>
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
          </div>
        )}

        {/* Row 2: Summary tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Current Monthly Impact", value: fmt(computed.currentMonthlyImpact), sub: `${costImpactPct}% of household expenses`, color: computed.currentMonthlyImpact > v.monthly_expenses_now * 0.3 ? "var(--amber, #f59e0b)" : "var(--text-primary)" },
            { label: "Total Cost to Age 18", value: fmtK(computed.totalCostToAge18), sub: `${computed.remainingYears} years remaining`, color: "var(--text-primary)" },
            { label: "Retirement NW Impact", value: retirementImpact != null ? "-" + fmtK(retirementImpact) : "—", sub: retirementImpact != null ? "vs no child costs" : "Add profile for forecast", color: retirementImpact != null && retirementImpact > 0 ? "var(--red, #ef4444)" : "var(--text-secondary)" },
          ].map(({ label, value, sub, color }, ti) => (
            <div key={label} className="bt-summary-tile" style={{ ...cardS, padding: "14px 16px", animation: `bt-fade-up 0.35s ease-out ${ti * 0.07}s both` }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "var(--font-mono)", animation: "bt-pop 0.4s ease-out 0.2s both" }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Row 3: Chart */}
        {computed.chartData.length > 0 ? (
          <div className="bt-card" style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out 0.1s both" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Annual Child Costs by Age</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              {(["Infant", "Child", "Teen"] as const).map((p) => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[p] }} />
                  {p}
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={computed.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="age" tickFormatter={(val) => `${val}`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} label={{ value: "Child Age", position: "insideBottom", offset: -2, fill: "var(--text-secondary)", fontSize: 11 }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={56} />
                <Tooltip
                  formatter={(val) => typeof val === "number" ? [fmt(val), "Annual Cost"] : [String(val ?? ""), "Annual Cost"]}
                  labelFormatter={(label) => `Age ${label}`}
                  contentStyle={{ background: "oklch(0.13 0.01 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: 8, fontSize: 12, color: "oklch(0.92 0.01 240)" }}
                  labelStyle={{ color: "oklch(0.92 0.01 240)", fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: "oklch(0.72 0.04 240)" }}
                  cursor={{ fill: "oklch(0.20 0.01 240 / 0.7)" }}
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

        {/* Row 4: Retirement Impact + FINN side by side */}
        <div data-family-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "stretch" }}>

          {computed.projectedNWBefore != null && computed.projectedNWAfter != null && computed.retirProbBefore != null && (
            <div style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out both" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Retirement Impact</div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg-elevated, var(--bg-base))", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Retirement Probability</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary, var(--text-muted))", lineHeight: 1.4 }}>
                    {(computed.retirProbAfter ?? 0) >= 80 ? "Above 80% — retirement plan on track" : (computed.retirProbAfter ?? 0) >= 60 ? "60–80% — manageable, monitor closely" : "Below 60% — review contributions"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 900, color: (computed.retirProbAfter ?? 0) >= 80 ? "var(--green)" : (computed.retirProbAfter ?? 0) >= 60 ? "var(--amber)" : "var(--red)", lineHeight: 1, animation: "bt-pop 0.5s ease-out 0.15s both" }}>
                    {computed.retirProbAfter}%
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>was {computed.retirProbBefore}%</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Without Child", value: fmtK(computed.projectedNWBefore), color: "#94a3b8" },
                  { label: "With Child", value: fmtK(Math.max(0, computed.projectedNWAfter)), color: "#3b82f6" },
                  { label: "Difference", value: (computed.projectedNWAfter - computed.projectedNWBefore >= 0 ? "+" : "") + fmtK(computed.projectedNWAfter - computed.projectedNWBefore), color: computed.projectedNWAfter >= computed.projectedNWBefore ? "var(--green)" : "var(--red)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "10px 12px", background: "var(--bg-elevated, var(--bg-base))", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary, var(--text-muted))", marginTop: 2 }}>at retirement</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out 0.08s both", display: "flex", flexDirection: "column", background: "linear-gradient(145deg, oklch(0.12 0.03 285) 0%, oklch(0.10 0.01 240) 60%, oklch(0.11 0.02 265) 100%)", overflow: "hidden", position: "relative" }}>
            {/* ambient glow orb */}
            <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, oklch(0.50 0.25 290 / 0.12) 0%, transparent 70%)", pointerEvents: "none", animation: "bt-orb-pulse 4s ease-in-out infinite" }} />
            <div style={{ position: "absolute", bottom: -30, left: -20, width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, oklch(0.55 0.18 265 / 0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 16, position: "relative" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "oklch(0.50 0.25 290 / 0.15)", border: "1px solid oklch(0.50 0.25 290 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="oklch(0.72 0.2 290)" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="oklch(0.72 0.2 290)" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="oklch(0.72 0.2 290)" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.01em" }}>FINN Deep Analysis</div>
                <div style={{ fontSize: 10, color: "oklch(0.60 0.12 290)", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Family Advisor</div>
              </div>
            </div>

            {/* content area */}
            <div style={{ flex: 1, position: "relative" }}>
              {commentary ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, animation: "bt-fade-up 0.4s ease-out both" }}>{commentary}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: "16px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, animation: "bt-orb-pulse 3s ease-in-out infinite" }}>🤖</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Ready to analyze your plan</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, maxWidth: 260 }}>Get personalized guidance on timing, child costs, and retirement impact for your specific situation.</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    {["Cost timing", "Retirement risk", "Optimal delay"].map((tag) => (
                      <span key={tag} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "oklch(0.50 0.2 290 / 0.1)", border: "1px solid oklch(0.50 0.2 290 / 0.2)", color: "oklch(0.65 0.12 290)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* footer button */}
            <div style={{ marginTop: 14, position: "relative" }}>
              <button
                onClick={handleGetCommentary}
                disabled={loadingCommentary}
                className="bt-finn-btn"
                style={{ width: "100%", padding: "10px 16px", background: loadingCommentary ? "oklch(0.50 0.2 290 / 0.08)" : "oklch(0.50 0.2 290 / 0.14)", color: "oklch(0.78 0.18 290)", border: `1px solid oklch(0.50 0.2 290 / ${loadingCommentary ? "0.15" : "0.35"})`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loadingCommentary ? "not-allowed" : "pointer", opacity: loadingCommentary ? 0.7 : 1, fontFamily: "var(--font-body)", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {loadingCommentary ? (
                  <>
                    <span style={{ width: 12, height: 12, border: "2px solid oklch(0.60 0.15 290)", borderTopColor: "transparent", borderRadius: "50%", animation: "bt-spin 0.7s linear infinite", display: "inline-block" }} />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z" fill="oklch(0.78 0.18 290)"/></svg>
                    Get FINN Guidance
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Row 5: Scenario Comparison Table */}
        {computed.comparisonRows.length > 0 && (
          <div className="bt-card" style={{ ...cardS, animation: "bt-fade-up 0.4s ease-out 0.05s both" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>Scenario Comparison</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Scenario", "Monthly Cost", "Retire Assets", "Ret. Prob.", "Verdict"].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.comparisonRows.map((row, i) => {
                    const vm = verdictMeta[row.verdict];
                    const isHighlight = row.verdict === "READY" || row.verdict === "LOW_IMPACT";
                    return (
                      <tr key={i} className="bt-comp-row" style={{ borderTop: "1px solid var(--border-subtle, var(--border))", animation: `bt-row-in 0.3s ease-out ${0.05 + i * 0.05}s both` }}>
                        <td style={{ padding: "10px 12px 10px 0", color: "var(--text-primary)", fontWeight: 500 }}>{row.label}</td>
                        <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(row.monthlyCost)}/mo</td>
                        <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(row.retirAssets)}</td>
                        <td style={{ padding: "10px 12px 10px 0" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: row.retirProbability >= 80 ? "var(--green)" : row.retirProbability >= 60 ? "var(--amber)" : "var(--red)" }}>
                            {row.retirProbability}%
                          </span>
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, background: isHighlight ? `color-mix(in oklch, ${vm.color} 12%, transparent)` : `color-mix(in oklch, ${vm.color} 8%, transparent)`, color: vm.color, border: `1px solid color-mix(in oklch, ${vm.color} 25%, transparent)`, whiteSpace: "nowrap" }}>
                            {vm.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes bt-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bt-scale-x {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes bt-slide-right {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes bt-pop {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes bt-chip-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bt-row-in {
          from { opacity: 0; transform: translateX(-5px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes bt-orb-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes bt-spin {
          to { transform: rotate(360deg); }
        }
        .bt-timing-row { transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease; }
        .bt-timing-row:hover { transform: translateX(4px); background: oklch(0.19 0.03 265 / 0.5) !important; box-shadow: inset 0 0 0 1px oklch(0.55 0.15 265 / 0.25), 0 0 8px oklch(0.55 0.15 265 / 0.08); }
        .bt-flip-row { transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; }
        .bt-flip-row:hover { transform: translateX(4px); background: oklch(0.18 0.05 145 / 0.35) !important; box-shadow: inset 0 0 0 1px oklch(0.65 0.18 145 / 0.3), 0 0 10px oklch(0.65 0.18 145 / 0.1); }
        .bt-eco-tile { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .bt-eco-tile:hover { transform: translateY(-3px); box-shadow: 0 0 0 1px oklch(0.55 0.15 265 / 0.35), 0 6px 22px oklch(0.45 0.15 265 / 0.22); }
        .bt-comp-row { transition: background 0.14s ease; }
        .bt-comp-row:hover td { background: color-mix(in oklch, oklch(0.55 0.15 265) 9%, transparent) !important; }
        .bt-card { transition: box-shadow 0.22s ease; }
        .bt-card:hover { box-shadow: 0 0 0 1px oklch(0.50 0.12 265 / 0.35), 0 6px 28px oklch(0.45 0.12 265 / 0.14) !important; }
        .bt-summary-tile { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .bt-summary-tile:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px oklch(0.55 0.15 265 / 0.3), 0 6px 20px oklch(0.45 0.12 265 / 0.16) !important; }
        .bt-finn-btn { transition: background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease !important; }
        .bt-finn-btn:not(:disabled):hover { background: oklch(0.50 0.2 290 / 0.24) !important; border-color: oklch(0.50 0.2 290 / 0.6) !important; box-shadow: 0 0 18px oklch(0.50 0.25 290 / 0.45) !important; }
        .bt-child-btn:hover { box-shadow: 0 0 10px oklch(0.55 0.15 265 / 0.2) !important; }
        @media (max-width: 900px) {
          [data-family-fw] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          [data-family-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
