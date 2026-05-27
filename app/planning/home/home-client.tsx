"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { HomeScenario } from "./home-actions";
import { saveHomeScenario, deleteHomeScenario } from "./home-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import { addFutureEvent } from "@/app/planning/planning-actions";
import type { HomeFinnRequest } from "@/app/api/planning/home-finn/route";

// ── Math engines ──────────────────────────────────────────────────────────────

function calcMortgagePayment(loan: number, annualRate: number, termYears: number): number {
  if (loan <= 0) return 0;
  if (annualRate <= 0) return loan / (termYears * 12);
  const r = annualRate / 12;
  const n = termYears * 12;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

type YearPoint = {
  year: number;
  homeEquity: number;
  homeValue: number;
  rentPortfolio: number;
  monthlyOwn: number;
  monthlyRent: number;
};

function buildTimeline(
  purchasePrice: number,
  downPayment: number,
  annualRate: number,
  termYears: number,
  taxMonthly: number,
  insMonthly: number,
  hoaMonthly: number,
  maintPct: number,
  startRent: number,
  rentGrowth: number,
  appreciation: number,
  investReturn: number,
  closingPct: number,
  holdYears: number,
): YearPoint[] {
  const loan = purchasePrice - downPayment;
  const closingCosts = purchasePrice * closingPct;
  const monthlyPmt = calcMortgagePayment(loan, annualRate, termYears);
  const r = annualRate / 12;
  const ir = investReturn / 12;

  let homeValue = purchasePrice;
  let balance = loan;
  // Renter invests the down payment + closing costs instead of putting them into a house
  let rentPortfolio = downPayment + closingCosts;

  const points: YearPoint[] = [];

  for (let y = 0; y <= holdYears; y++) {
    if (y > 0) {
      for (let m = 0; m < 12; m++) {
        // Appreciation
        homeValue *= 1 + appreciation / 12;
        // Amortize
        if (balance > 0) {
          const interest = balance * r;
          const principal = Math.min(monthlyPmt - interest, balance);
          balance = Math.max(0, balance - principal);
        }
        // Monthly cost comparison
        const ownCost = monthlyPmt + taxMonthly + insMonthly + hoaMonthly + (homeValue * maintPct) / 12;
        const rentNow = startRent * Math.pow(1 + rentGrowth, (y - 1) + m / 12);
        // Renter invests the cost difference if ownership is pricier
        const savingsByRenting = ownCost - rentNow;
        if (savingsByRenting > 0) rentPortfolio += savingsByRenting;
        // Portfolio grows
        rentPortfolio *= 1 + ir;
      }
    }

    const equity = homeValue - balance;
    const maintMonthly = (homeValue * maintPct) / 12;
    const currentRent = startRent * Math.pow(1 + rentGrowth, y);
    const currentOwn = monthlyPmt + taxMonthly + insMonthly + hoaMonthly + maintMonthly;

    points.push({
      year: y,
      homeEquity: Math.round(equity),
      homeValue: Math.round(homeValue),
      rentPortfolio: Math.round(rentPortfolio),
      monthlyOwn: Math.round(currentOwn),
      monthlyRent: Math.round(currentRent),
    });
  }
  return points;
}

function calcRetirementProb(netWorth: number, annualExpenses: number): number | null {
  if (annualExpenses <= 0 || netWorth <= 0) return null;
  const ratio = netWorth / (annualExpenses * 25);
  if (ratio >= 1.5) return 95;
  if (ratio >= 1.2) return 88;
  if (ratio >= 1.0) return 82;
  if (ratio >= 0.8) return 70;
  if (ratio >= 0.6) return 55;
  if (ratio >= 0.4) return 38;
  return 20;
}

// ── Verdict engine ────────────────────────────────────────────────────────────

type VerdictData = {
  verdict: "BUY" | "WAIT" | "RENT";
  confidence: "High" | "Medium" | "Low";
  reasons: string[];
};

function calcVerdict(
  breakEvenYear: number | null,
  retirBaselineProb: number | null,
  retirWithHomeProb: number | null,
  affordabilityRatio: number | null,
  holdYears: number,
): VerdictData {
  const retirDelta = retirBaselineProb != null && retirWithHomeProb != null
    ? retirWithHomeProb - retirBaselineProb
    : null;
  const reasons: string[] = [];
  const longBreakEven = breakEvenYear != null && breakEvenYear > 10;
  const noBreakEven = breakEvenYear == null;
  const retirementDamage = retirDelta != null && retirDelta < -5;

  if (longBreakEven || retirementDamage) {
    if (longBreakEven) reasons.push(`Break-even is ${breakEvenYear} years out — beyond most hold periods`);
    if (noBreakEven) reasons.push(`Buying doesn't out-earn renting within the hold window`);
    if (retirementDamage) reasons.push(`Reduces retirement probability by ${Math.abs(retirDelta!)}pp`);
    if (affordabilityRatio != null && affordabilityRatio > 1.15)
      reasons.push(`Monthly cost is ${Math.round(affordabilityRatio * 100 - 100)}% over income guideline`);
    return {
      verdict: "RENT",
      confidence: longBreakEven && retirementDamage ? "High" : "Medium",
      reasons: reasons.slice(0, 3),
    };
  }

  const quickBreakEven = breakEvenYear != null && breakEvenYear <= 5;
  const retirNeutral = retirDelta == null || retirDelta >= -2;
  const affordable = affordabilityRatio == null || affordabilityRatio <= 1.0;

  if (quickBreakEven && retirNeutral && affordable) {
    reasons.push(`Equity outpaces renting in ${breakEvenYear} year${breakEvenYear === 1 ? "" : "s"}`);
    if (retirDelta != null && retirDelta >= 0)
      reasons.push(`Retirement outlook ${retirDelta > 0 ? "improves" : "stays on track"}`);
    else
      reasons.push(`Break-even clears well within hold period`);
    if (affordabilityRatio != null && affordabilityRatio <= 0.9)
      reasons.push(`Within income affordability guidelines`);
    return {
      verdict: "BUY",
      confidence: breakEvenYear! <= 3 && (affordabilityRatio == null || affordabilityRatio <= 0.9) ? "High" : "Medium",
      reasons: reasons.slice(0, 3),
    };
  }

  if (breakEvenYear != null && breakEvenYear <= holdYears)
    reasons.push(`Break-even in ${breakEvenYear} years — stay ${holdYears - breakEvenYear}+ more years to capture gains`);
  else if (noBreakEven)
    reasons.push(`Extend hold period or improve assumptions to find break-even`);
  if (!affordable)
    reasons.push(`Monthly cost is tight at ${Math.round((affordabilityRatio! || 1) * 100)}% of income guideline`);
  if (retirDelta != null && retirDelta < -2 && retirDelta >= -5)
    reasons.push(`Moderate retirement impact (${retirDelta}pp) — worth monitoring`);
  if (reasons.length === 0)
    reasons.push(`Neutral market conditions — timing and assumptions are borderline`);

  return { verdict: "WAIT", confidence: "Medium", reasons: reasons.slice(0, 3) };
}

// ── Affordability score ───────────────────────────────────────────────────────

type AffordabilityComponent = { label: string; score: number; detail: string };
type AffordabilityScore = { score: number; rating: string; components: AffordabilityComponent[] };

function calcAffordabilityScore(
  totalMonthly: number,
  income: number | null | undefined,
  purchasePrice: number,
  downPayment: number,
  breakEvenYear: number | null,
  holdYears: number,
  retirDelta: number | null,
): AffordabilityScore | null {
  if (!income || income <= 0) return null;
  const maxPITI = income * 0.28;

  const housingRatio = totalMonthly / maxPITI;
  const housingScore = housingRatio <= 0.75 ? 100
    : housingRatio <= 1.0 ? Math.round(100 - (housingRatio - 0.75) * 240)
    : housingRatio <= 1.35 ? Math.round(40 - (housingRatio - 1.0) * 114)
    : 0;

  const downPct = (downPayment / purchasePrice) * 100;
  const downScore = downPct >= 20 ? 100
    : downPct >= 15 ? Math.round(70 + (downPct - 15) * 6)
    : downPct >= 10 ? Math.round(50 + (downPct - 10) * 4)
    : downPct >= 5 ? Math.round(30 + (downPct - 5) * 4)
    : Math.max(0, Math.round(downPct * 6));

  const pti = purchasePrice / (income * 12);
  const ptiScore = pti <= 2.5 ? 100
    : pti <= 3.5 ? Math.round(100 - (pti - 2.5) * 35)
    : pti <= 5.5 ? Math.round(65 - (pti - 3.5) * 22.5)
    : Math.max(0, Math.round(20 - (pti - 5.5) * 10));

  const retirScore = retirDelta == null ? 70
    : retirDelta >= 0 ? 100
    : retirDelta >= -3 ? Math.round(100 + retirDelta * 10)
    : retirDelta >= -8 ? Math.round(70 + (retirDelta + 3) * 8)
    : Math.max(0, Math.round(30 + (retirDelta + 8) * 3));

  const beFitScore = breakEvenYear == null ? 15
    : breakEvenYear <= Math.ceil(holdYears / 2) ? 100
    : breakEvenYear <= holdYears ? 70
    : breakEvenYear <= holdYears * 1.5 ? 35
    : 10;

  const score = Math.round(
    housingScore * 0.25 + downScore * 0.20 + ptiScore * 0.20 + retirScore * 0.20 + beFitScore * 0.15,
  );
  const rating = score >= 90 ? "Excellent" : score >= 75 ? "Comfortable" : score >= 60 ? "Stretch" : "High Risk";

  return {
    score,
    rating,
    components: [
      { label: "Housing Cost Ratio", score: housingScore, detail: `${Math.round(housingRatio * 100)}% of the 28% income guideline` },
      { label: "Down Payment",       score: downScore,    detail: `${downPct.toFixed(0)}% down (${downPct >= 20 ? "conventional" : downPct >= 10 ? "below conventional" : "low down payment"})` },
      { label: "Price-to-Income",    score: ptiScore,     detail: `${pti.toFixed(1)}x annual gross income` },
      { label: "Retirement Impact",  score: retirScore,   detail: retirDelta == null ? "No planning profile" : retirDelta >= 0 ? "Maintained or improved" : `${Math.abs(retirDelta)}pp decline in retirement probability` },
      { label: "Break-even Fit",     score: beFitScore,   detail: breakEvenYear == null ? "No break-even within window" : `Year ${breakEvenYear} vs ${holdYears}-yr hold` },
    ],
  };
}

// ── Scenario comparison ───────────────────────────────────────────────────────

type ScenarioSummary = {
  id: string;
  name: string;
  purchasePrice: number;
  totalMonthly: number;
  breakEvenYear: number | null;
  retirBaselineAssets: number | null;
  retirWithHomeAssets: number | null;
  retirBaselineProb: number | null;
  retirWithHomeProb: number | null;
  verdictData: VerdictData;
  affordabilityScore: AffordabilityScore | null;
};

function computeScenarioSummary(s: HomeScenario, profile: FinancialProfile | null): ScenarioSummary {
  const loan = s.purchase_price - s.down_payment;
  const monthlyPmt = calcMortgagePayment(loan, s.mortgage_rate, s.loan_term_years);
  const maintMonthly = (s.purchase_price * s.maintenance_pct) / 12;
  const totalMonthly = monthlyPmt + s.property_tax_monthly + s.insurance_monthly + s.hoa_monthly + maintMonthly;
  const closingCosts = s.purchase_price * s.closing_cost_pct;
  const timeline = buildTimeline(
    s.purchase_price, s.down_payment, s.mortgage_rate, s.loan_term_years,
    s.property_tax_monthly, s.insurance_monthly, s.hoa_monthly, s.maintenance_pct,
    s.monthly_rent, s.rent_growth_rate, s.expected_appreciation, s.investment_return,
    s.closing_cost_pct, s.hold_years,
  );
  const breakEvenYear = timeline.find((p) => p.year > 0 && p.homeEquity > p.rentPortfolio)?.year ?? null;
  const lastPoint = timeline[timeline.length - 1];
  const ir = s.investment_return;
  let retirBaselineProb: number | null = null;
  let retirWithHomeProb: number | null = null;
  let retirBaselineAssets: number | null = null;
  let retirWithHomeAssets: number | null = null;
  if (profile?.current_age && profile?.target_retirement_age && profile?.monthly_income && profile?.monthly_expenses) {
    const yearsToRetire = profile.target_retirement_age - profile.current_age;
    if (yearsToRetire > 0) {
      const annualSavingsBase = (profile.monthly_income - profile.monthly_expenses) * 12;
      const baseGrowth = annualSavingsBase > 0
        ? annualSavingsBase * ((Math.pow(1 + ir, yearsToRetire) - 1) / ir)
        : 0;
      retirBaselineProb = calcRetirementProb(baseGrowth, profile.monthly_expenses * 12);
      retirBaselineAssets = Math.round(baseGrowth);
      const extraMonthly = totalMonthly - s.monthly_rent;
      const reducedSavings = annualSavingsBase - Math.max(0, extraMonthly) * 12;
      const withHomeGrowth = reducedSavings > 0
        ? reducedSavings * ((Math.pow(1 + ir, yearsToRetire) - 1) / ir) - s.down_payment - closingCosts
        : -(s.down_payment + closingCosts);
      const withHomeTotal = Math.max(0, withHomeGrowth + (lastPoint?.homeEquity ?? 0));
      retirWithHomeProb = calcRetirementProb(withHomeTotal, profile.monthly_expenses * 12);
      retirWithHomeAssets = Math.round(withHomeTotal);
    }
  }
  const affordabilityRatio = profile?.monthly_income && profile.monthly_income > 0
    ? totalMonthly / (profile.monthly_income * 0.28)
    : null;
  const verdictData = calcVerdict(breakEvenYear, retirBaselineProb, retirWithHomeProb, affordabilityRatio, s.hold_years);
  const retirDeltaVal = retirBaselineProb != null && retirWithHomeProb != null
    ? retirWithHomeProb - retirBaselineProb : null;
  const affordabilityScore = calcAffordabilityScore(
    totalMonthly, profile?.monthly_income, s.purchase_price, s.down_payment, breakEvenYear, s.hold_years, retirDeltaVal,
  );
  return {
    id: s.id, name: s.name, purchasePrice: s.purchase_price, totalMonthly,
    breakEvenYear, retirBaselineAssets, retirWithHomeAssets, retirBaselineProb, retirWithHomeProb,
    verdictData, affordabilityScore,
  };
}

// ── Home price recommendation ─────────────────────────────────────────────────

function calcMaxPrice(
  monthlyIncome: number,
  dtiRatio: number,
  annualMortgageRate: number,
  termYears: number,
): number {
  const maxMonthly = monthlyIncome * dtiRatio;
  const r = annualMortgageRate / 12;
  const n = termYears * 12;
  const mortgageFactor = r > 0 ? (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 1 / n;
  const piPerDollar = 0.8 * mortgageFactor;
  const overheadPerDollar = 0.016 / 12;
  return Math.round((maxMonthly / (piPerDollar + overheadPerDollar)) / 5000) * 5000;
}

// ── Path ranking ─────────────────────────────────────────────────────────────

type PathScore = {
  id: string;
  name: string;
  score: number;
  rank: number;
  isRentPath: boolean;
  retirAssets: number | null;
  retirProb: number | null;
  verdict: "BUY" | "WAIT" | "RENT";
  scoreBreakdown: { retirement: number; wealth: number; affordability: number; breakeven: number; liquidity: number };
};

function rankPaths(
  summaries: ScenarioSummary[],
  rentBaseline: { retirAssets: number | null; retirProb: number | null; monthlyRent: number },
  income: number | null | undefined,
): PathScore[] {
  const allAssets: number[] = [];
  for (const ss of summaries) {
    if (ss.retirWithHomeAssets != null) allAssets.push(ss.retirWithHomeAssets);
  }
  if (rentBaseline.retirAssets != null) allAssets.push(rentBaseline.retirAssets);
  const maxAssets = allAssets.length > 0 ? Math.max(...allAssets) : 0;

  function breakdownFor(
    retirWithProb: number | null, retirBaseProb: number | null,
    retirWithAssets: number | null, affordScore: number | null,
    breakEvenYear: number | null, downPayment: number, isRent: boolean,
  ): PathScore["scoreBreakdown"] {
    const delta = retirWithProb != null && retirBaseProb != null ? retirWithProb - retirBaseProb : 0;
    const retirement = isRent ? 80
      : delta >= 0 ? 100
      : delta >= -3 ? Math.round(100 + delta * 8)
      : delta >= -8 ? Math.round(76 + (delta + 3) * 7)
      : Math.max(20, Math.round(41 + (delta + 8) * 4));
    const wealth = maxAssets > 0 && retirWithAssets != null
      ? Math.max(10, Math.round((retirWithAssets / maxAssets) * 100))
      : 50;
    const affordability = isRent
      ? (income && income > 0
          ? Math.max(20, Math.min(100, 100 - Math.round(Math.max(0, (rentBaseline.monthlyRent / (income * 0.28)) - 0.5) * 80)))
          : 70)
      : (affordScore ?? 70);
    const breakeven = isRent ? 55
      : breakEvenYear == null ? 15
      : breakEvenYear <= 5 ? 100
      : breakEvenYear <= 10 ? 70
      : 30;
    const liquidity = isRent ? 100
      : income && income > 0
        ? Math.max(10, Math.min(100, Math.round(100 - (downPayment / (income * 12)) * 100)))
        : 50;
    return { retirement, wealth, affordability, breakeven, liquidity };
  }

  function composite(bd: PathScore["scoreBreakdown"]): number {
    return Math.round(bd.retirement * 0.30 + bd.wealth * 0.25 + bd.affordability * 0.25 + bd.breakeven * 0.10 + bd.liquidity * 0.10);
  }

  const paths: Omit<PathScore, "rank">[] = [];

  const rentBd = breakdownFor(
    rentBaseline.retirProb, rentBaseline.retirProb,
    rentBaseline.retirAssets, null, null, 0, true,
  );
  paths.push({
    id: "rent", name: "Continue Renting", score: composite(rentBd), isRentPath: true,
    retirAssets: rentBaseline.retirAssets, retirProb: rentBaseline.retirProb,
    verdict: "RENT", scoreBreakdown: rentBd,
  });

  for (const ss of summaries) {
    const bd = breakdownFor(
      ss.retirWithHomeProb, ss.retirBaselineProb, ss.retirWithHomeAssets,
      ss.affordabilityScore?.score ?? null, ss.breakEvenYear,
      ss.purchasePrice * 0.20, false,
    );
    paths.push({
      id: ss.id, name: ss.name, score: composite(bd), isRentPath: false,
      retirAssets: ss.retirWithHomeAssets, retirProb: ss.retirWithHomeProb,
      verdict: ss.verdictData.verdict, scoreBreakdown: bd,
    });
  }

  paths.sort((a, b) => b.score - a.score);
  return paths.map((p, i) => ({ ...p, rank: i + 1 }));
}

// ── Readiness score ───────────────────────────────────────────────────────────

type ReadinessComponent = { label: string; score: number; detail: string };
type ReadinessScore = { score: number; rating: string; components: ReadinessComponent[] };

function calcReadinessScore(
  totalMonthly: number,
  income: number | null | undefined,
  expenses: number | null | undefined,
  downPayment: number,
  purchasePrice: number,
  retirBaselineProb: number | null,
  closingCosts: number,
): ReadinessScore | null {
  if (!income || income <= 0) return null;

  const downPct = (downPayment / purchasePrice) * 100;
  const downScore = downPct >= 20 ? 100
    : downPct >= 15 ? Math.round(75 + (downPct - 15) * 5)
    : downPct >= 10 ? Math.round(55 + (downPct - 10) * 4)
    : downPct >= 5 ? Math.round(30 + (downPct - 5) * 5)
    : Math.max(0, Math.round(downPct * 6));

  const bufferRatio = (income - totalMonthly) / income;
  const bufferScore = bufferRatio >= 0.30 ? 100
    : bufferRatio >= 0.20 ? Math.round(75 + (bufferRatio - 0.20) * 250)
    : bufferRatio >= 0.10 ? Math.round(50 + (bufferRatio - 0.10) * 250)
    : bufferRatio >= 0 ? Math.round(bufferRatio * 500)
    : 0;

  const savingsRate = expenses && expenses > 0 ? Math.max(0, (income - expenses) / income) : null;
  const savingsScore = savingsRate == null ? 60
    : savingsRate >= 0.20 ? 100
    : savingsRate >= 0.10 ? Math.round(70 + (savingsRate - 0.10) * 300)
    : savingsRate >= 0.05 ? Math.round(50 + (savingsRate - 0.05) * 400)
    : Math.round(savingsRate * 1000);

  const monthlySavings = expenses ? Math.max(0, income - expenses) : income * 0.10;
  const monthsToRecover = monthlySavings > 0 ? (downPayment + closingCosts) / monthlySavings : 999;
  const liquidityScore = Math.max(0, monthsToRecover <= 12 ? 100
    : monthsToRecover <= 24 ? Math.round(100 - (monthsToRecover - 12) * 5)
    : monthsToRecover <= 48 ? Math.round(40 - (monthsToRecover - 24) * 1.5)
    : 0);

  const retirScore = retirBaselineProb == null ? 60
    : retirBaselineProb >= 82 ? 100
    : retirBaselineProb >= 70 ? Math.round(70 + (retirBaselineProb - 70) * 2.5)
    : retirBaselineProb >= 55 ? Math.round(45 + (retirBaselineProb - 55) * 1.67)
    : Math.max(15, Math.round(retirBaselineProb * 0.8));

  const expenseRatio = expenses ? expenses / income : 0.65;
  const debtScore = expenseRatio <= 0.50 ? 100
    : expenseRatio <= 0.65 ? Math.round(100 - (expenseRatio - 0.50) * 400)
    : expenseRatio <= 0.80 ? Math.round(40 - (expenseRatio - 0.65) * 200)
    : Math.max(0, Math.round(10 - (expenseRatio - 0.80) * 50));

  const score = Math.round(
    downScore * 0.20 + bufferScore * 0.20 + savingsScore * 0.18 + liquidityScore * 0.17 + retirScore * 0.15 + debtScore * 0.10,
  );
  const rating = score >= 90 ? "Ready" : score >= 75 ? "Mostly Ready" : score >= 60 ? "Needs Preparation" : "Not Recommended";

  return {
    score, rating,
    components: [
      { label: "Down Payment Strength", score: downScore,    detail: `${downPct.toFixed(0)}% down${downPct >= 20 ? " — conventional strength" : downPct >= 10 ? " — below conventional" : " — consider more savings"}` },
      { label: "Income Buffer",         score: bufferScore,  detail: `${Math.round(bufferRatio * 100)}% of income remains after monthly mortgage costs` },
      { label: "Savings Rate",          score: savingsScore, detail: savingsRate != null ? `${Math.round(savingsRate * 100)}% of income saved monthly (profile estimate)` : "Add monthly expenses for savings rate analysis" },
      { label: "Liquidity Recovery",    score: liquidityScore, detail: monthsToRecover < 999 ? `~${Math.round(monthsToRecover)} months to rebuild cash reserves from savings` : "Add monthly expenses for liquidity analysis" },
      { label: "Retirement Progress",   score: retirScore,   detail: retirBaselineProb != null ? `${retirBaselineProb}% probability of funding retirement (without home)` : "Complete planning profile for retirement analysis" },
      { label: "Expense Load",          score: debtScore,    detail: expenses ? `${Math.round(expenseRatio * 100)}% expense-to-income ratio` : "Add monthly expenses for expense load analysis" },
    ],
  };
}

// ── Stress tests ──────────────────────────────────────────────────────────────

type StressLevel = { level: "Mild" | "Moderate" | "Severe"; scenario: string; score: number; detail: string };

function calcStressTests(
  totalMonthly: number,
  income: number | null | undefined,
  expenses: number | null | undefined,
): StressLevel[] | null {
  if (!income || income <= 0) return null;
  const f = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const expAmt = expenses ?? income * 0.70;
  const monthlySavings = Math.max(0, income - expAmt);
  const estimatedReserves = monthlySavings * 6;

  const mildCost = 5000;
  const mildRecover = monthlySavings > 0 ? Math.ceil(mildCost / monthlySavings) : 99;
  const mildScore = estimatedReserves >= mildCost * 3 ? 10
    : estimatedReserves >= mildCost ? 8
    : mildRecover <= 3 ? 7
    : mildRecover <= 6 ? 5
    : monthlySavings > 0 ? 3
    : 1;

  const modGapPerMonth = totalMonthly - income * 0.5;
  const mod3Shortfall = modGapPerMonth > 0 ? modGapPerMonth * 3 : 0;
  const modScore = mod3Shortfall <= 0 ? 10
    : estimatedReserves >= mod3Shortfall * 2 ? 8
    : estimatedReserves >= mod3Shortfall ? 6
    : estimatedReserves >= mod3Shortfall * 0.5 ? 4
    : 2;

  const sevShortfall = totalMonthly * 6;
  const sevScore = estimatedReserves >= sevShortfall * 1.5 ? 10
    : estimatedReserves >= sevShortfall ? 8
    : estimatedReserves >= sevShortfall * 0.5 ? 5
    : estimatedReserves >= sevShortfall * 0.25 ? 3
    : 1;

  return [
    {
      level: "Mild", scenario: `${f(mildCost)} unexpected repair`, score: mildScore,
      detail: mildScore >= 8 ? `Estimated reserves cover ${f(mildCost)} with room to spare`
        : mildScore >= 5 ? `Recoverable in ~${mildRecover} month${mildRecover === 1 ? "" : "s"} from savings`
        : "Would strain monthly budget — limited reserves estimated",
    },
    {
      level: "Moderate", scenario: "3 months at 50% income", score: modScore,
      detail: mod3Shortfall <= 0 ? "Mortgage payments covered even at half income"
        : modScore >= 6 ? `Estimated reserves absorb ${f(mod3Shortfall)} shortfall`
        : `${f(mod3Shortfall)} shortfall likely exceeds estimated reserves`,
    },
    {
      level: "Severe", scenario: "6 months unemployment", score: sevScore,
      detail: sevScore >= 8 ? "Estimated reserves cover 6-month mortgage payments"
        : sevScore >= 5 ? `Partial coverage — ${f(Math.max(0, sevShortfall - estimatedReserves))} reserve gap`
        : `Significant exposure — reserves likely cover under 25% of ${f(sevShortfall)} needed`,
    },
  ];
}

// ── Amortization table ────────────────────────────────────────────────────────

type AmorRow = {
  year: number;
  balance: number;
  annualPrincipal: number;
  annualInterest: number;
  cumulativeInterest: number;
  homeValue: number;
  equity: number;
  equityPct: number;
  isCrossover: boolean;
};

type AmorStats = {
  totalInterest: number;
  crossoverYear: number | null;
  equity20Year: number | null;
  equity50Year: number | null;
  equity80Year: number | null;
  monthlyPayment: number;
};

function buildAmortization(
  loan: number,
  annualRate: number,
  termYears: number,
  purchasePrice: number,
  appreciation: number,
): { rows: AmorRow[]; stats: AmorStats } {
  const empty: { rows: AmorRow[]; stats: AmorStats } = {
    rows: [],
    stats: { totalInterest: 0, crossoverYear: null, equity20Year: null, equity50Year: null, equity80Year: null, monthlyPayment: 0 },
  };
  if (loan <= 0 || annualRate <= 0) return empty;

  const r = annualRate / 12;
  const n = termYears * 12;
  const monthlyPmt = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  let balance = loan;
  let homeValue = purchasePrice;
  let cumulativeInterest = 0;
  let crossoverYear: number | null = null;
  let equity20Year: number | null = null;
  let equity50Year: number | null = null;
  let equity80Year: number | null = null;

  const initEquityPct = homeValue > 0 ? ((homeValue - balance) / homeValue) * 100 : 0;
  const rows: AmorRow[] = [
    {
      year: 0, balance, annualPrincipal: 0, annualInterest: 0,
      cumulativeInterest, homeValue, equity: homeValue - balance,
      equityPct: initEquityPct, isCrossover: false,
    },
  ];

  for (let year = 1; year <= termYears; year++) {
    let annualPrincipal = 0;
    let annualInterest = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      homeValue *= 1 + appreciation / 12;
      const interest = balance * r;
      const principal = Math.min(monthlyPmt - interest, balance);
      balance = Math.max(0, balance - principal);
      annualPrincipal += principal;
      annualInterest += interest;
      cumulativeInterest += interest;
    }
    const equity = homeValue - balance;
    const equityPct = homeValue > 0 ? (equity / homeValue) * 100 : 0;
    const isCrossover = crossoverYear == null && annualPrincipal > annualInterest;
    if (isCrossover) crossoverYear = year;
    if (equity20Year == null && equityPct >= 20) equity20Year = year;
    if (equity50Year == null && equityPct >= 50) equity50Year = year;
    if (equity80Year == null && equityPct >= 80) equity80Year = year;
    rows.push({ year, balance, annualPrincipal, annualInterest, cumulativeInterest, homeValue, equity, equityPct, isCrossover: !!isCrossover });
  }

  return {
    rows,
    stats: {
      totalInterest: cumulativeInterest,
      crossoverYear,
      equity20Year,
      equity50Year,
      equity80Year,
      monthlyPayment: monthlyPmt,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + Math.round(n);
};
const pct = (n: number) => n.toFixed(2) + "%";

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

// ── Default scenario ──────────────────────────────────────────────────────────

const BASE_DEFAULTS = {
  name: "New Home Scenario",
  purchase_price: 500000,
  down_payment: 100000,
  mortgage_rate: 6.75,
  loan_term_years: 30,
  property_tax_monthly: 500,
  insurance_monthly: 150,
  hoa_monthly: 0,
  maintenance_pct: 1.0,
  monthly_rent: 2500,
  rent_growth_rate: 3.0,
  expected_appreciation: 3.5,
  investment_return: 7.0,
  hold_years: 7,
  closing_cost_pct: 3.0,
};

type Inputs = typeof BASE_DEFAULTS;

// ── Market presets ────────────────────────────────────────────────────────────

type MarketPreset = {
  label: string;
  purchase_price: number;
  monthly_rent: number;
  tax_rate: number;
  insurance_monthly: number;
  appreciation: number;
  rent_growth: number;
};

const MARKET_PRESETS: Record<string, MarketPreset> = {
  dfw:         { label: "Dallas-Fort Worth", purchase_price: 380000, monthly_rent: 2100, tax_rate: 1.70, insurance_monthly: 175, appreciation: 3.5, rent_growth: 3.0 },
  houston:     { label: "Houston",           purchase_price: 320000, monthly_rent: 1800, tax_rate: 1.80, insurance_monthly: 165, appreciation: 3.0, rent_growth: 2.5 },
  austin:      { label: "Austin",            purchase_price: 480000, monthly_rent: 2400, tax_rate: 1.80, insurance_monthly: 195, appreciation: 4.0, rent_growth: 3.5 },
  san_antonio: { label: "San Antonio",       purchase_price: 280000, monthly_rent: 1600, tax_rate: 1.75, insurance_monthly: 145, appreciation: 3.0, rent_growth: 2.5 },
  atlanta:     { label: "Atlanta",           purchase_price: 360000, monthly_rent: 2000, tax_rate: 0.90, insurance_monthly: 160, appreciation: 3.5, rent_growth: 3.0 },
  phoenix:     { label: "Phoenix",           purchase_price: 420000, monthly_rent: 2100, tax_rate: 0.60, insurance_monthly: 170, appreciation: 4.5, rent_growth: 3.5 },
  denver:      { label: "Denver",            purchase_price: 560000, monthly_rent: 2400, tax_rate: 0.55, insurance_monthly: 185, appreciation: 3.5, rent_growth: 3.0 },
  nashville:   { label: "Nashville",         purchase_price: 420000, monthly_rent: 2100, tax_rate: 0.70, insurance_monthly: 170, appreciation: 4.0, rent_growth: 3.5 },
  charlotte:   { label: "Charlotte",         purchase_price: 360000, monthly_rent: 1900, tax_rate: 0.80, insurance_monthly: 155, appreciation: 4.0, rent_growth: 3.5 },
  tampa:       { label: "Tampa",             purchase_price: 380000, monthly_rent: 2000, tax_rate: 1.00, insurance_monthly: 250, appreciation: 4.0, rent_growth: 3.0 },
  national:    { label: "National Average",  purchase_price: 420000, monthly_rent: 2000, tax_rate: 1.10, insurance_monthly: 170, appreciation: 3.5, rent_growth: 3.0 },
};

// Derive smart defaults from the user's financial profile.
// Uses the 28% front-end DTI rule to estimate a comfortable purchase price,
// then backs into a down payment (20%) and property tax/insurance from price.
function buildDefaults(
  profile: FinancialProfile | null,
  defaultInvestmentReturn: number,
): Inputs {
  const base: Inputs = {
    ...BASE_DEFAULTS,
    investment_return: +(defaultInvestmentReturn * 100).toFixed(2),
  };

  if (!profile?.monthly_income || profile.monthly_income <= 0) return base;

  const income = profile.monthly_income;

  // 28% rule: max PITI (principal + interest + tax + insurance)
  const maxPITI = income * 0.28;

  // At a standard 6.75% rate, 30yr, 20% down:
  // monthly P&I factor on the full loan amount = mortgage_factor
  const rMonthly = 0.0675 / 12;
  const n = 360;
  const mortgageFactor = (rMonthly * Math.pow(1 + rMonthly, n)) / (Math.pow(1 + rMonthly, n) - 1);
  // P&I per dollar of purchase price (80% LTV) = 0.8 * mortgageFactor
  const piPerDollar = 0.8 * mortgageFactor;

  // Annual overhead per dollar of price: tax 1.2% + insurance 0.4% = 1.6%/yr → /12
  const overheadPerDollar = 0.016 / 12;

  // price = maxPITI / (piPerDollar + overheadPerDollar), rounded to nearest $5k
  const rawPrice = maxPITI / (piPerDollar + overheadPerDollar);
  const suggestedPrice = Math.round(rawPrice / 5000) * 5000;

  if (suggestedPrice < 50_000) return base;

  const suggestedDown = Math.round(suggestedPrice * 0.2 / 1000) * 1000;
  const suggestedTax = Math.round((suggestedPrice * 0.012) / 12 / 10) * 10;
  const suggestedIns = Math.round((suggestedPrice * 0.004) / 12 / 10) * 10;

  // Use monthly_expenses as a proxy for current rent if available
  const suggestedRent = profile.monthly_expenses && profile.monthly_expenses > 0
    ? Math.round(profile.monthly_expenses / 100) * 100
    : base.monthly_rent;

  return {
    ...base,
    purchase_price: suggestedPrice,
    down_payment: suggestedDown,
    property_tax_monthly: suggestedTax,
    insurance_monthly: Math.max(75, suggestedIns),
    monthly_rent: suggestedRent,
  };
}


function scenarioToInputs(s: HomeScenario): Inputs {
  return {
    name: s.name,
    purchase_price: s.purchase_price,
    down_payment: s.down_payment,
    mortgage_rate: +(s.mortgage_rate * 100).toFixed(3),
    loan_term_years: s.loan_term_years,
    property_tax_monthly: s.property_tax_monthly,
    insurance_monthly: s.insurance_monthly,
    hoa_monthly: s.hoa_monthly,
    maintenance_pct: +(s.maintenance_pct * 100).toFixed(2),
    monthly_rent: s.monthly_rent,
    rent_growth_rate: +(s.rent_growth_rate * 100).toFixed(2),
    expected_appreciation: +(s.expected_appreciation * 100).toFixed(2),
    investment_return: +(s.investment_return * 100).toFixed(2),
    hold_years: s.hold_years,
    closing_cost_pct: +(s.closing_cost_pct * 100).toFixed(2),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeClient({
  scenarios,
  profile,
  defaultInvestmentReturn,
}: {
  scenarios: HomeScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
}) {
  const router = useRouter();
  const smartDefaults = buildDefaults(profile, defaultInvestmentReturn);
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
  const [showAmortization, setShowAmortization] = useState(false);
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "done" | "error">("idle");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  function applyPreset(key: string) {
    const preset = MARKET_PRESETS[key];
    if (!preset) return;
    setInputs((prev) => ({
      ...prev,
      purchase_price: preset.purchase_price,
      down_payment: Math.round(preset.purchase_price * 0.2),
      monthly_rent: preset.monthly_rent,
      property_tax_monthly: Math.round((preset.purchase_price * preset.tax_rate) / 100 / 12),
      insurance_monthly: preset.insurance_monthly,
      expected_appreciation: preset.appreciation,
      rent_growth_rate: preset.rent_growth,
    }));
    setFinnCommentary(null);
  }

  function set<K extends keyof Inputs>(key: K, val: Inputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
    setFinnCommentary(null);
  }
  function num(key: keyof Inputs) {
    return (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as Inputs[typeof key]);
  }

  // ── Derived calculations ───────────────────────────────────────────────────

  const computed = useMemo(() => {
    const {
      purchase_price: pp, down_payment: dp, mortgage_rate: rate, loan_term_years: term,
      property_tax_monthly: tax, insurance_monthly: ins, hoa_monthly: hoa,
      maintenance_pct: maint, monthly_rent: rent, rent_growth_rate: rentG,
      expected_appreciation: appr, investment_return: ir, hold_years: hold, closing_cost_pct: cc,
    } = inputs;

    const loan = pp - dp;
    const monthlyPmt = calcMortgagePayment(loan, rate / 100, term);
    const maintMonthly = (pp * (maint / 100)) / 12;
    const totalMonthly = monthlyPmt + tax + ins + hoa + maintMonthly;

    // Year 1 principal (first month)
    const firstInterest = loan * (rate / 100 / 12);
    const firstPrincipal = monthlyPmt - firstInterest;

    // True effective cost: total monthly - principal paydown + opportunity cost on equity
    const opportunityCostOnEquity = (dp * (ir / 100)) / 12;
    const trueEffectiveCost = totalMonthly - firstPrincipal + opportunityCostOnEquity;

    const timeline = buildTimeline(
      pp, dp, rate / 100, term,
      tax, ins, hoa, maint / 100,
      rent, rentG / 100, appr / 100, ir / 100, cc / 100, hold,
    );

    const lastPoint = timeline[timeline.length - 1];
    const breakEvenYear = timeline.find((p) => p.year > 0 && p.homeEquity > p.rentPortfolio)?.year ?? null;

    // Closing costs
    const closingCosts = pp * (cc / 100);

    // Retirement impact
    let retirBaselineProb: number | null = null;
    let retirWithHomeProb: number | null = null;
    let retirBaselineAssets: number | null = null;
    let retirWithHomeAssets: number | null = null;
    if (profile?.current_age && profile?.target_retirement_age && profile?.monthly_income && profile?.monthly_expenses) {
      const yearsToRetire = profile.target_retirement_age - profile.current_age;
      if (yearsToRetire > 0) {
        const annualSavingsBase = (profile.monthly_income - profile.monthly_expenses) * 12;
        const baseGrowth = annualSavingsBase > 0
          ? annualSavingsBase * ((Math.pow(1 + ir / 100, yearsToRetire) - 1) / (ir / 100))
          : 0;
        retirBaselineProb = calcRetirementProb(baseGrowth, profile.monthly_expenses * 12);
        retirBaselineAssets = Math.round(baseGrowth);

        const extraMonthly = totalMonthly - rent;
        const reducedSavings = annualSavingsBase - Math.max(0, extraMonthly) * 12;
        const withHomeGrowth = reducedSavings > 0
          ? reducedSavings * ((Math.pow(1 + ir / 100, yearsToRetire) - 1) / (ir / 100)) - dp - closingCosts
          : -(dp + closingCosts);
        const withHomeTotal = Math.max(0, withHomeGrowth + (lastPoint?.homeEquity ?? 0));
        retirWithHomeProb = calcRetirementProb(withHomeTotal, profile.monthly_expenses * 12);
        retirWithHomeAssets = Math.round(withHomeTotal);
      }
    }

    const { rows: amortization, stats: amortStats } = buildAmortization(
      loan, rate / 100, term, pp, appr / 100,
    );

    const affordabilityRatio = profile?.monthly_income && profile.monthly_income > 0
      ? totalMonthly / (profile.monthly_income * 0.28)
      : null;

    const appreciationCreditMonthly = (pp * (appr / 100)) / 12;
    const equivalentRent = Math.max(0, totalMonthly - firstPrincipal - appreciationCreditMonthly);

    const verdictData = calcVerdict(breakEvenYear, retirBaselineProb, retirWithHomeProb, affordabilityRatio, hold);

    const holdAmortRow = amortization[Math.min(hold, amortization.length - 1)];
    const remainingBalance = holdAmortRow?.balance ?? 0;
    const projectedSalePrice = lastPoint?.homeValue ?? 0;
    const sellTransactionCost = projectedSalePrice * 0.06;
    const totalMonthlyCashOut = totalMonthly * 12 * hold;
    const upfrontCashOut = dp + closingCosts;
    const netSaleProceeds = projectedSalePrice - remainingBalance - sellTransactionCost;
    const trueNetOwnershipCost = upfrontCashOut + totalMonthlyCashOut - Math.max(0, netSaleProceeds);
    let rentAlternativeTotalCost = 0;
    for (let y = 0; y < hold; y++) rentAlternativeTotalCost += rent * Math.pow(1 + rentG / 100, y) * 12;
    const realOwnershipCost = {
      totalMonthlyCashOut, upfrontCashOut, sellTransactionCost,
      projectedSalePrice, remainingBalance, netSaleProceeds,
      trueNetOwnershipCost, rentAlternativeTotalCost,
    };

    const opportunityCost = [10, 20, 30, 40].map((years) => ({
      years,
      value: Math.round(dp * Math.pow(1 + ir / 100, years)),
    }));

    const retirDeltaVal = retirBaselineProb != null && retirWithHomeProb != null
      ? retirWithHomeProb - retirBaselineProb
      : null;

    const affordabilityScore = calcAffordabilityScore(
      totalMonthly, profile?.monthly_income, pp, dp, breakEvenYear, hold, retirDeltaVal,
    );

    const buyingAdvantages: string[] = [];
    const rentingAdvantages: string[] = [];
    if (breakEvenYear != null && breakEvenYear <= hold)
      buyingAdvantages.push(`Break-even in ${breakEvenYear} year${breakEvenYear === 1 ? "" : "s"} — equity compounds beyond that`);
    if (rent >= equivalentRent)
      buyingAdvantages.push(`Rent (${fmt(rent)}) exceeds equivalent ownership cost (${fmt(equivalentRent)})`);
    if (appr > ir)
      buyingAdvantages.push(`Appreciation (${appr}%/yr) exceeds investment return assumption (${ir}%/yr)`);
    if (retirDeltaVal != null && retirDeltaVal >= 0)
      buyingAdvantages.push("Retirement probability maintained or improved with home equity");
    if (lastPoint && lastPoint.homeEquity > lastPoint.rentPortfolio)
      buyingAdvantages.push(`Home equity (${fmtK(lastPoint.homeEquity)}) leads renter portfolio at year ${hold}`);

    if (rent < equivalentRent)
      rentingAdvantages.push(`Rent (${fmt(rent)}) is below equivalent ownership cost — savings compound freely`);
    if (lastPoint && lastPoint.rentPortfolio > lastPoint.homeEquity)
      rentingAdvantages.push(`Renter portfolio (${fmtK(lastPoint.rentPortfolio)}) outpaces equity at year ${hold}`);
    if (ir > appr)
      rentingAdvantages.push(`Investment returns (${ir}%/yr) outpace home appreciation (${appr}%/yr)`);
    if (breakEvenYear == null || breakEvenYear > hold)
      rentingAdvantages.push(`No break-even within the ${hold}-year hold window`);
    if (retirDeltaVal != null && retirDeltaVal < -3)
      rentingAdvantages.push(`Buying reduces retirement probability by ${Math.abs(retirDeltaVal)}pp`);

    const homePriceRanges = profile?.monthly_income && profile.monthly_income > 0
      ? ([
          { label: "Conservative", dtiRatio: 0.28, desc: "Comfortable within guidelines" },
          { label: "Moderate",     dtiRatio: 0.33, desc: "Manageable stretch" },
          { label: "Aggressive",   dtiRatio: 0.40, desc: "Maximum stretch" },
        ] as const).map((range) => {
          const price = calcMaxPrice(profile.monthly_income!, range.dtiRatio, rate / 100, term);
          const downPayment = Math.round(price * 0.20);
          const monthlyEst = Math.round(
            calcMortgagePayment(price * 0.80, rate / 100, term)
            + (price * 0.012) / 12
            + (price * 0.004) / 12,
          );
          return { ...range, price, downPayment, monthlyEst };
        })
      : null;

    const readinessScore = calcReadinessScore(
      totalMonthly, profile?.monthly_income, profile?.monthly_expenses,
      dp, pp, retirBaselineProb, closingCosts,
    );

    const stressTests = calcStressTests(
      totalMonthly, profile?.monthly_income, profile?.monthly_expenses,
    );

    return {
      loan, monthlyPmt, maintMonthly, totalMonthly,
      firstPrincipal, firstInterest, trueEffectiveCost, opportunityCostOnEquity,
      timeline, lastPoint, breakEvenYear, closingCosts,
      retirBaselineProb, retirWithHomeProb, retirBaselineAssets, retirWithHomeAssets,
      amortization, amortStats,
      affordabilityRatio, equivalentRent, verdictData, realOwnershipCost,
      opportunityCost, affordabilityScore, buyingAdvantages, rentingAdvantages,
      homePriceRanges, readinessScore, stressTests,
    };
  }, [inputs, profile]);

  const scenarioSummaries = useMemo(
    () => scenarios.map((s) => computeScenarioSummary(s, profile)),
    [scenarios, profile],
  );

  const rankedPaths = useMemo(
    () => rankPaths(
      scenarioSummaries,
      { retirAssets: computed.retirBaselineAssets, retirProb: computed.retirBaselineProb, monthlyRent: inputs.monthly_rent },
      profile?.monthly_income,
    ),
    [scenarioSummaries, computed.retirBaselineAssets, computed.retirBaselineProb, inputs.monthly_rent, profile?.monthly_income],
  );

  // ── Save / Delete ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus("saving");
    const payload = {
      name: inputs.name,
      purchase_price: inputs.purchase_price,
      down_payment: inputs.down_payment,
      mortgage_rate: inputs.mortgage_rate / 100,
      loan_term_years: inputs.loan_term_years,
      property_tax_monthly: inputs.property_tax_monthly,
      insurance_monthly: inputs.insurance_monthly,
      hoa_monthly: inputs.hoa_monthly,
      maintenance_pct: inputs.maintenance_pct / 100,
      monthly_rent: inputs.monthly_rent,
      rent_growth_rate: inputs.rent_growth_rate / 100,
      expected_appreciation: inputs.expected_appreciation / 100,
      investment_return: inputs.investment_return / 100,
      hold_years: inputs.hold_years,
      closing_cost_pct: inputs.closing_cost_pct / 100,
    };
    const result = await saveHomeScenario(payload, activeScenarioId ?? undefined);
    if (result.error) { setSaveStatus("error"); return; }
    setActiveScenarioId(result.id ?? null);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
    router.refresh();
  }

  function handleLoadScenario(s: HomeScenario) {
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
      await deleteHomeScenario(id);
      if (activeScenarioId === id) handleNewScenario();
      setDeleteConfirm(null);
      router.refresh();
    });
  }

  async function fetchFinnCommentary() {
    setFinnLoading(true);
    setFinnCommentary(null);
    const body: HomeFinnRequest = {
      scenario_name: inputs.name,
      purchase_price: inputs.purchase_price,
      down_payment: inputs.down_payment,
      mortgage_rate: inputs.mortgage_rate / 100,
      loan_term_years: inputs.loan_term_years,
      monthly_ownership_cost: computed.totalMonthly,
      monthly_rent: inputs.monthly_rent,
      hold_years: inputs.hold_years,
      monthly_payment: computed.monthlyPmt,
      true_effective_cost: computed.trueEffectiveCost,
      break_even_year: computed.breakEvenYear,
      equity_at_hold: computed.lastPoint?.homeEquity ?? 0,
      home_value_at_hold: computed.lastPoint?.homeValue ?? 0,
      current_age: profile?.current_age ?? null,
      years_to_retire: profile && profile.current_age && profile.target_retirement_age
        ? profile.target_retirement_age - profile.current_age : null,
      net_worth: null,
      retirement_prob_baseline: computed.retirBaselineProb,
      retirement_prob_with_home: computed.retirWithHomeProb,
    };
    try {
      const res = await fetch("/api/planning/home-finn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { commentary?: string; error?: string };
      setFinnCommentary(data.commentary ?? data.error ?? "Analysis unavailable.");
    } catch {
      setFinnCommentary("Unable to reach FINN — please try again.");
    } finally {
      setFinnLoading(false);
    }
  }

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = computed.timeline.map((p) => ({
    name: p.year === 0 ? "Now" : `Yr ${p.year}`,
    "Home Equity": p.homeEquity,
    "Invested (Rent)": p.rentPortfolio,
  }));

  const downPct = inputs.purchase_price > 0
    ? ((inputs.down_payment / inputs.purchase_price) * 100).toFixed(0) : "0";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflowY: "auto", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10, gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/planning" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)", fontSize: "14px" }}>/</span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.2px", margin: 0 }}>Home Planning</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {scenarios.length > 0 && (
            <button type="button" onClick={handleNewScenario} style={{ fontSize: "11px", color: "var(--text-secondary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "5px 11px", cursor: "pointer" }}>
              + New
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            style={{ fontSize: "11px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", opacity: saveStatus === "saving" ? 0.7 : 1 }}
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save Scenario"}
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Saved scenarios list */}
        {scenarios.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {scenarios.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0" }}>
                <button
                  type="button"
                  onClick={() => handleLoadScenario(s)}
                  style={{
                    fontSize: "11px", padding: "5px 10px", borderRadius: "8px 0 0 8px",
                    border: "1px solid", borderRight: "none",
                    borderColor: s.id === activeScenarioId ? "rgba(37,99,235,0.5)" : "var(--card-border)",
                    background: s.id === activeScenarioId ? "rgba(37,99,235,0.08)" : "var(--card-bg)",
                    color: s.id === activeScenarioId ? "var(--brand-blue)" : "var(--text-secondary)",
                    cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: s.id === activeScenarioId ? 600 : 400,
                  }}
                >
                  {s.name}
                </button>
                {deleteConfirm === s.id ? (
                  <>
                    <button type="button" onClick={() => handleDelete(s.id)} disabled={isPending} style={{ fontSize: "10px", padding: "5px 8px", border: "1px solid var(--red-border)", borderRight: "none", background: "var(--red-bg)", color: "var(--red)", cursor: "pointer" }}>
                      Delete?
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(null)} style={{ fontSize: "10px", padding: "5px 8px", borderRadius: "0 8px 8px 0", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer" }}>
                      ×
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(s.id)} style={{ fontSize: "11px", padding: "5px 7px", borderRadius: "0 8px 8px 0", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer" }}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Compare Futures — ranked table */}
        {scenarios.length >= 1 && (() => {
          const vColors = {
            BUY:  { text: "oklch(0.70 0.18 155)", bg: "color-mix(in oklch, oklch(0.70 0.18 155) 10%, transparent)", border: "color-mix(in oklch, oklch(0.70 0.18 155) 25%, transparent)" },
            WAIT: { text: "oklch(0.80 0.14 80)",  bg: "color-mix(in oklch, oklch(0.80 0.14 80)  10%, transparent)", border: "color-mix(in oklch, oklch(0.80 0.14 80)  22%, transparent)" },
            RENT: { text: "oklch(0.68 0.18 25)",  bg: "color-mix(in oklch, oklch(0.68 0.18 25)  10%, transparent)", border: "color-mix(in oklch, oklch(0.68 0.18 25)  22%, transparent)" },
          };
          const rankColors = ["oklch(0.80 0.14 80)", "var(--text-secondary)", "var(--text-tertiary)", "var(--text-muted)"];
          const thS: React.CSSProperties = { padding: "6px 10px", textAlign: "right", fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", whiteSpace: "nowrap" as const, fontFamily: "var(--font-body)" };
          const tdS: React.CSSProperties = { padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)" };
          const hasRetir = computed.retirBaselineAssets != null;
          const hasProb = computed.retirBaselineProb != null;
          const winner = rankedPaths[0];
          return (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ ...sectionHead, margin: 0 }}>Scenario Rankings</p>
                  {winner && (
                    <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                      Best outcome: <span style={{ color: vColors[winner.verdict].text, fontWeight: 600 }}>{winner.name}</span> (score {winner.score})
                    </p>
                  )}
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{rankedPaths.length} paths ranked</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, textAlign: "left", paddingLeft: "16px", width: "24px" }}>#</th>
                      <th style={{ ...thS, textAlign: "left" }}>Path</th>
                      <th style={thS}>Score</th>
                      {hasRetir && <th style={thS}>Retire Assets</th>}
                      {hasProb && <th style={thS}>Retire %</th>}
                      <th style={{ ...thS, paddingRight: "16px" }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedPaths.map((rp) => {
                      const isActive = !rp.isRentPath && rp.id === activeScenarioId;
                      const isTop = rp.rank === 1;
                      const vc = vColors[rp.verdict];
                      const rankColor = rankColors[Math.min(rp.rank - 1, rankColors.length - 1)];
                      return (
                        <tr
                          key={rp.id}
                          style={{
                            background: isTop
                              ? "color-mix(in oklch, oklch(0.80 0.14 80) 5%, transparent)"
                              : isActive ? "color-mix(in oklch, #3b82f6 4%, transparent)" : "transparent",
                            cursor: rp.isRentPath ? "default" : "pointer",
                          }}
                          onClick={() => {
                            if (rp.isRentPath) return;
                            const s = scenarios.find((sc) => sc.id === rp.id);
                            if (s) handleLoadScenario(s);
                          }}
                        >
                          <td style={{ ...tdS, textAlign: "center", paddingLeft: "16px", fontWeight: 800, color: rankColor, fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                            {rp.rank}
                          </td>
                          <td style={{ ...tdS, textAlign: "left", fontFamily: "var(--font-body)", fontSize: "12px", color: isActive ? "#3b82f6" : isTop ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isTop || isActive ? 600 : 400 }}>
                            {rp.name}{isActive ? " ●" : ""}
                          </td>
                          <td style={{ ...tdS, fontWeight: 700, color: isTop ? "oklch(0.80 0.14 80)" : "var(--text-secondary)" }}>
                            {rp.score}
                          </td>
                          {hasRetir && (
                            <td style={{ ...tdS, fontWeight: 600, color: rp.retirAssets != null && computed.retirBaselineAssets != null && !rp.isRentPath && rp.retirAssets >= computed.retirBaselineAssets ? "oklch(0.70 0.18 155)" : "var(--text-secondary)" }}>
                              {rp.retirAssets != null ? fmtK(rp.retirAssets) : "—"}
                            </td>
                          )}
                          {hasProb && (
                            <td style={{ ...tdS, fontWeight: 600, color: rp.retirProb != null && computed.retirBaselineProb != null && !rp.isRentPath && rp.retirProb >= computed.retirBaselineProb ? "oklch(0.70 0.18 155)" : "var(--text-secondary)" }}>
                              {rp.retirProb != null ? `${rp.retirProb}%` : "—"}
                            </td>
                          )}
                          <td style={{ ...tdS, paddingRight: "16px" }}>
                            <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: "12px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-body)", background: vc.bg, color: vc.text, border: `1px solid ${vc.border}` }}>
                              {rp.verdict}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "9px", color: "var(--text-muted)", padding: "8px 16px", borderTop: "1px solid var(--border-subtle)", margin: 0, lineHeight: 1.5 }}>
                Score = retirement (30%) + wealth (25%) + affordability (25%) + break-even (10%) + liquidity (10%). Click any scenario row to load it.
              </p>
            </div>
          );
        })()}

        {/* Main layout: inputs left, analysis right */}
        <div data-home-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: "20px", alignItems: "start" }}>

          {/* ── LEFT: Inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Scenario name */}
            <div>
              <label style={labelS}>Scenario Name</label>
              <input value={inputs.name} onChange={(e) => set("name", e.target.value)} style={inputS} />
            </div>

            {/* Affordability hint — shown when income is known */}
            {profile?.monthly_income && profile.monthly_income > 0 && (() => {
              const maxPITI = profile.monthly_income! * 0.28;
              const totalMonthly = computed.totalMonthly;
              const ratio = totalMonthly / maxPITI;
              const isOver = ratio > 1;
              return (
                <div style={{
                  padding: "9px 12px", borderRadius: "var(--radius-md)",
                  background: isOver
                    ? "color-mix(in oklch, oklch(0.45 0.18 25) 12%, transparent)"
                    : "color-mix(in oklch, oklch(0.55 0.15 155) 10%, transparent)",
                  border: `1px solid ${isOver ? "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 22%, transparent)"}`,
                  display: "flex", alignItems: "flex-start", gap: "8px",
                }}>
                  <div style={{
                    width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                    background: isOver ? "oklch(0.45 0.18 25)" : "oklch(0.55 0.15 155)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "9px", color: "#fff", fontWeight: 700 }}>{isOver ? "!" : "✓"}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: isOver ? "oklch(0.75 0.12 25)" : "oklch(0.80 0.12 155)", fontFamily: "var(--font-body)" }}>
                      {isOver
                        ? `${Math.round(ratio * 100)}% of income — above 28% guideline`
                        : `${Math.round(ratio * 100)}% of income — within 28% guideline`}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
                      Based on {fmt(profile.monthly_income!)}/mo income · 28% rule suggests max {fmt(Math.round(maxPITI))}/mo PITI
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* What Can I Afford? */}
            {computed.homePriceRanges && (
              <div style={cardS}>
                <p style={{ ...sectionHead, marginBottom: "4px" }}>What Can I Afford?</p>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Based on {fmt(profile!.monthly_income!)}/mo income at {inputs.mortgage_rate}% for {inputs.loan_term_years} yrs.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {computed.homePriceRanges.map((range) => {
                    const isActive = Math.abs(inputs.purchase_price - range.price) < 5001;
                    return (
                      <div
                        key={range.label}
                        style={{
                          display: "grid", gridTemplateColumns: "100px 1fr auto", alignItems: "center", gap: "10px",
                          padding: "10px 12px", borderRadius: "var(--radius-md)",
                          background: isActive ? "color-mix(in oklch, #3b82f6 8%, var(--bg-elevated))" : "var(--bg-elevated)",
                          border: isActive ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{range.label}</div>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "1px", lineHeight: 1.4 }}>{Math.round(range.dtiRatio * 100)}% DTI</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(range.price)}</div>
                          <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                            {fmtK(range.downPayment)} down · {fmt(range.monthlyEst)}/mo est.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setInputs((prev) => ({
                              ...prev,
                              purchase_price: range.price,
                              down_payment: range.downPayment,
                              property_tax_monthly: Math.round((range.price * 0.012) / 12 / 10) * 10,
                              insurance_monthly: Math.max(75, Math.round((range.price * 0.004) / 12 / 10) * 10),
                            }));
                            setFinnCommentary(null);
                          }}
                          style={{ fontSize: "10px", padding: "4px 9px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}
                        >
                          Apply
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  Estimates assume 20% down, 1.2% tax, 0.4% insurance. Adjust inputs above for precision.
                </p>
              </div>
            )}

            {/* Market presets */}
            <div style={cardS}>
              <p style={sectionHead}>Market Preset</p>
              <select
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  applyPreset(e.target.value);
                }}
                style={{ ...inputS, fontFamily: "var(--font-body)", color: selectedPreset ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                <option value="">Custom</option>
                {Object.entries(MARKET_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
              {selectedPreset && (
                <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                  Loaded {MARKET_PRESETS[selectedPreset]?.label} median data. Adjust any field to customize.
                </p>
              )}
            </div>

            {/* Property */}
            <div style={cardS}>
              <p style={sectionHead}>Property</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={labelS}>Purchase Price</label>
                  <input type="number" min="0" value={inputs.purchase_price} onChange={num("purchase_price")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Down Payment — {downPct}% ({fmt(inputs.down_payment)})</label>
                  <input type="number" min="0" max={inputs.purchase_price} value={inputs.down_payment} onChange={num("down_payment")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Closing Costs (%)</label>
                  <input type="number" min="0" max="10" step="0.1" value={inputs.closing_cost_pct} onChange={num("closing_cost_pct")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Financing */}
            <div style={cardS}>
              <p style={sectionHead}>Financing</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Rate (%)</label>
                  <input type="number" min="0" max="20" step="0.05" value={inputs.mortgage_rate} onChange={num("mortgage_rate")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Term (years)</label>
                  <select value={inputs.loan_term_years} onChange={(e) => set("loan_term_years", Number(e.target.value))} style={{ ...inputS, fontFamily: "var(--font-body)" }}>
                    {[10, 15, 20, 25, 30, 50].map((t) => <option key={t} value={t}>{t} yr</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Monthly costs */}
            <div style={cardS}>
              <p style={sectionHead}>Monthly Costs</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {([
                  ["Property Tax / mo", "property_tax_monthly"],
                  ["Insurance / mo", "insurance_monthly"],
                  ["HOA / mo", "hoa_monthly"],
                ] as [string, keyof Inputs][]).map(([lbl, key]) => (
                  <div key={key}>
                    <label style={labelS}>{lbl}</label>
                    <input type="number" min="0" value={inputs[key] as number} onChange={num(key)} style={inputS} />
                  </div>
                ))}
                <div>
                  <label style={labelS}>Maintenance (% / yr)</label>
                  <input type="number" min="0" max="5" step="0.1" value={inputs.maintenance_pct} onChange={num("maintenance_pct")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Comparison */}
            <div style={cardS}>
              <p style={sectionHead}>Rent Alternative</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Current Rent / mo</label>
                  <input type="number" min="0" value={inputs.monthly_rent} onChange={num("monthly_rent")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Rent Growth (%/yr)</label>
                  <input type="number" min="0" max="10" step="0.1" value={inputs.rent_growth_rate} onChange={num("rent_growth_rate")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Long-term assumptions */}
            <div style={cardS}>
              <p style={sectionHead}>Assumptions</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Appreciation (%/yr)</label>
                  <input type="number" min="0" max="20" step="0.1" value={inputs.expected_appreciation} onChange={num("expected_appreciation")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Inv. Return (%/yr)</label>
                  <input type="number" min="0" max="20" step="0.1" value={inputs.investment_return} onChange={num("investment_return")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Hold Period (years)</label>
                  <input type="number" min="1" max="30" value={inputs.hold_years} onChange={num("hold_years")} style={inputS} />
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT: Analysis ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Best Financial Outcome */}
            {rankedPaths.length >= 2 && (() => {
              const top = rankedPaths[0];
              const second = rankedPaths[1];
              const scoreDiff = top.score - second.score;
              const confidence = Math.min(96, Math.max(52, 52 + scoreDiff * 2.2));
              const retirAdvantage = top.retirAssets != null && second.retirAssets != null
                ? top.retirAssets - second.retirAssets : null;
              const vColors = {
                BUY:  "oklch(0.70 0.18 155)",
                WAIT: "oklch(0.80 0.14 80)",
                RENT: "oklch(0.68 0.18 25)",
              };
              const topColor = vColors[top.verdict];

              // Generate reasons from breakdown
              const reasons: string[] = [];
              const bd = top.scoreBreakdown;
              const bd2 = second.scoreBreakdown;
              if (bd.retirement >= 80 && bd.retirement > bd2.retirement) reasons.push("Strongest retirement outcome");
              if (bd.wealth > bd2.wealth) reasons.push("Highest projected wealth at retirement");
              if (bd.affordability >= 80) reasons.push("Fits within income affordability guidelines");
              if (bd.liquidity > bd2.liquidity + 10) reasons.push("Best capital liquidity preservation");
              if (bd.breakeven > bd2.breakeven) reasons.push("Fastest equity break-even path");
              if (top.isRentPath) reasons.push("No capital locked — investment returns compound freely");
              if (reasons.length === 0) reasons.push("Best composite score across all financial dimensions");

              return (
                <div style={{
                  background: `color-mix(in oklch, ${topColor} 6%, var(--card-bg))`,
                  border: `1px solid color-mix(in oklch, ${topColor} 25%, transparent)`,
                  borderRadius: "var(--radius-lg)", padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Best Financial Outcome</p>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: "20px", background: "rgba(245,158,11,0.10)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.22)" }}>
                      AI Engine
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: "16px", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>Recommended Path</div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 800, color: topColor, letterSpacing: "-0.8px", lineHeight: 1.1 }}>
                        {top.name}
                      </div>
                      {retirAdvantage != null && Math.abs(retirAdvantage) > 1000 && (
                        <div style={{ marginTop: "6px" }}>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "2px" }}>Expected Advantage</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: topColor }}>
                            {retirAdvantage > 0 ? "+" : ""}{fmtK(retirAdvantage)}
                          </div>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>vs {second.name}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "center", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px" }}>Confidence</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, color: topColor, lineHeight: 1 }}>{Math.round(confidence)}%</div>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>score lead: +{scoreDiff}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px" }}>
                    {reasons.slice(0, 4).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: "7px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        <span style={{ color: topColor, flexShrink: 0, fontWeight: 700 }}>✓</span>{r}
                      </div>
                    ))}
                  </div>
                  {second && (
                    <div style={{ borderTop: `1px solid color-mix(in oklch, ${topColor} 15%, transparent)`, paddingTop: "10px" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        Alternative: <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{second.name}</span>
                        {" "}(score {second.score}{retirAdvantage != null && Math.abs(retirAdvantage) > 1000 ? `, ${fmtK(Math.abs(retirAdvantage))} ${retirAdvantage >= 0 ? "less" : "more"} in retirement assets` : ""})
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* BuyTune Verdict */}
            {(() => {
              const v = computed.verdictData;
              const palette = {
                BUY:  { text: "oklch(0.70 0.18 155)", bg: "color-mix(in oklch, oklch(0.70 0.18 155) 7%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.70 0.18 155) 22%, transparent)" },
                WAIT: { text: "oklch(0.80 0.14 80)",  bg: "color-mix(in oklch, oklch(0.80 0.14 80)  7%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.80 0.14 80)  20%, transparent)" },
                RENT: { text: "oklch(0.68 0.18 25)",  bg: "color-mix(in oklch, oklch(0.68 0.18 25)  7%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.68 0.18 25)  20%, transparent)" },
              };
              const confPalette = {
                High:   { bg: "rgba(0,211,149,0.10)",   text: "#00d395",         border: "rgba(0,211,149,0.25)" },
                Medium: { bg: "rgba(245,158,11,0.10)",  text: "#f59e0b",         border: "rgba(245,158,11,0.25)" },
                Low:    { bg: "rgba(148,163,184,0.10)", text: "var(--text-muted)", border: "rgba(148,163,184,0.2)" },
              };
              const c = palette[v.verdict];
              const cc = confPalette[v.confidence];
              return (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--radius-lg)", padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>BuyTune Verdict</p>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: "20px", background: cc.bg, color: cc.text, border: `1px solid ${cc.border}` }}>
                      {v.confidence} Confidence
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "42px", fontWeight: 800, color: c.text, letterSpacing: "-1.5px", lineHeight: 1, marginBottom: "14px" }}>
                    {v.verdict}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "10px" }}>
                    {v.reasons.map((reason, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        <span style={{ color: c.text, flexShrink: 0, fontWeight: 700, marginTop: "1px", fontSize: "11px" }}>{v.verdict === "RENT" ? "×" : "✓"}</span>
                        {reason}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                    Live analysis — updates automatically as you adjust inputs.
                  </p>
                </div>
              );
            })()}

            {/* Retirement Impact Centerpiece */}
            {computed.retirBaselineProb != null && (
              <div style={cardS}>
                <p style={sectionHead}>Retirement Impact</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "16px", marginBottom: computed.retirBaselineAssets != null ? "14px" : "0" }}>
                  <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>Without Home</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700, color: "var(--text-secondary)", lineHeight: 1 }}>{computed.retirBaselineProb}%</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>on track</div>
                  </div>
                  <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                    <path d="M1 6h18M13 1l6 5-6 5" stroke={computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{
                    background: computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb
                      ? "color-mix(in oklch, oklch(0.70 0.18 155) 8%, var(--bg-elevated))"
                      : "color-mix(in oklch, oklch(0.78 0.15 80) 8%, var(--bg-elevated))",
                    borderRadius: "var(--radius-md)", padding: "14px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>With Home</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700, lineHeight: 1, color: computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)" }}>
                      {computed.retirWithHomeProb ?? "—"}%
                    </div>
                    {computed.retirWithHomeProb != null && (
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                        {computed.retirWithHomeProb - computed.retirBaselineProb >= 0 ? "+" : ""}{computed.retirWithHomeProb - computed.retirBaselineProb}pp
                      </div>
                    )}
                  </div>
                </div>
                {computed.retirBaselineAssets != null && computed.retirWithHomeAssets != null && (() => {
                  const diff = computed.retirWithHomeAssets - computed.retirBaselineAssets;
                  return (
                    <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "10px" }}>Projected Retirement Assets</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                        {[
                          { label: "Without Home", val: computed.retirBaselineAssets, color: "var(--text-secondary)", prefix: "" },
                          { label: "With Home",    val: computed.retirWithHomeAssets, color: diff >= 0 ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)", prefix: "" },
                          { label: "Difference",   val: diff, color: diff >= 0 ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)", prefix: diff >= 0 ? "+" : "" },
                        ].map(({ label, val, color, prefix }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>
                              {prefix}{fmtK(Math.abs(val))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  Based on your planning profile. Home equity at year {inputs.hold_years} counted as a retirement asset.
                </p>
              </div>
            )}

            {/* Affordability Score */}
            {computed.affordabilityScore && (() => {
              const { score, rating, components } = computed.affordabilityScore;
              const scoreColor = score >= 90 ? "oklch(0.70 0.18 155)" : score >= 75 ? "oklch(0.80 0.14 80)" : score >= 60 ? "oklch(0.72 0.18 55)" : "oklch(0.68 0.18 25)";
              const ratingStyle = {
                bg: score >= 90 ? "rgba(0,211,149,0.10)" : score >= 75 ? "rgba(245,158,11,0.10)" : score >= 60 ? "rgba(249,115,22,0.10)" : "rgba(239,68,68,0.10)",
                border: score >= 90 ? "rgba(0,211,149,0.25)" : score >= 75 ? "rgba(245,158,11,0.25)" : score >= 60 ? "rgba(249,115,22,0.25)" : "rgba(239,68,68,0.25)",
              };
              return (
                <div style={cardS}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Affordability Score</p>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: "20px", background: ratingStyle.bg, color: scoreColor, border: `1px solid ${ratingStyle.border}` }}>
                      {rating}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "3px", marginBottom: "12px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "52px", fontWeight: 800, lineHeight: 1, color: scoreColor }}>{score}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-subtle)", marginBottom: "16px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${score}%`, borderRadius: "3px", background: scoreColor, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {components.map(({ label, score: cs, detail }) => {
                      const cColor = cs >= 80 ? "oklch(0.70 0.18 155)" : cs >= 55 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)";
                      return (
                        <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 72px 28px", alignItems: "center", gap: "10px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{detail}</div>
                          </div>
                          <div style={{ height: "4px", borderRadius: "2px", background: "var(--border-subtle)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${cs}%`, borderRadius: "2px", background: cColor }} />
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: cColor, textAlign: "right" }}>{cs}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Home Readiness Score */}
            {computed.readinessScore && (() => {
              const { score, rating, components } = computed.readinessScore;
              const rColor = score >= 90 ? "oklch(0.70 0.18 155)" : score >= 75 ? "oklch(0.80 0.14 80)" : score >= 60 ? "oklch(0.72 0.18 55)" : "oklch(0.68 0.18 25)";
              const rBadge = {
                bg: score >= 90 ? "rgba(0,211,149,0.10)" : score >= 75 ? "rgba(245,158,11,0.10)" : score >= 60 ? "rgba(249,115,22,0.10)" : "rgba(239,68,68,0.10)",
                border: score >= 90 ? "rgba(0,211,149,0.25)" : score >= 75 ? "rgba(245,158,11,0.25)" : score >= 60 ? "rgba(249,115,22,0.25)" : "rgba(239,68,68,0.25)",
              };
              return (
                <div style={cardS}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Home Readiness Score</p>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 8px", borderRadius: "20px", background: rBadge.bg, color: rColor, border: `1px solid ${rBadge.border}` }}>
                      {rating}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "3px", marginBottom: "12px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "52px", fontWeight: 800, lineHeight: 1, color: rColor }}>{score}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-subtle)", marginBottom: "16px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${score}%`, borderRadius: "3px", background: rColor, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {components.map(({ label, score: cs, detail }) => {
                      const cColor = cs >= 80 ? "oklch(0.70 0.18 155)" : cs >= 55 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)";
                      return (
                        <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 72px 28px", alignItems: "center", gap: "10px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{detail}</div>
                          </div>
                          <div style={{ height: "4px", borderRadius: "2px", background: "var(--border-subtle)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${cs}%`, borderRadius: "2px", background: cColor }} />
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: cColor, textAlign: "right" }}>{cs}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
                    Readiness = financial preparedness. Affordability Score = monthly cost fit. Both matter.
                  </p>
                </div>
              );
            })()}

            {/* Financial Resilience (Stress Test) */}
            {computed.stressTests && (() => {
              const tests = computed.stressTests;
              const avgScore = Math.round(tests.reduce((s, t) => s + t.score, 0) / tests.length);
              const levelColors = {
                Mild:     { score: tests[0].score, color: tests[0].score >= 7 ? "oklch(0.70 0.18 155)" : tests[0].score >= 5 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)" },
                Moderate: { score: tests[1].score, color: tests[1].score >= 7 ? "oklch(0.70 0.18 155)" : tests[1].score >= 5 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)" },
                Severe:   { score: tests[2].score, color: tests[2].score >= 7 ? "oklch(0.70 0.18 155)" : tests[2].score >= 5 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)" },
              };
              return (
                <div style={cardS}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Financial Resilience</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Avg</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: avgScore >= 7 ? "oklch(0.70 0.18 155)" : avgScore >= 5 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)" }}>{avgScore}/10</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {tests.map((t) => {
                      const { color } = levelColors[t.level];
                      const pct10 = (t.score / 10) * 100;
                      return (
                        <div key={t.level}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                            <div>
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{t.level} Stress</span>
                              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "6px" }}>{t.scenario}</span>
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color }}>{t.score}/10</span>
                          </div>
                          <div style={{ height: "5px", borderRadius: "2.5px", background: "var(--border-subtle)", overflow: "hidden", marginBottom: "4px" }}>
                            <div style={{ height: "100%", width: `${pct10}%`, borderRadius: "2.5px", background: color, transition: "width 0.4s ease" }} />
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.4 }}>{t.detail}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
                    Based on estimated 6-month emergency reserve from savings rate. Add monthly expenses to planning profile for precision.
                  </p>
                </div>
              );
            })()}

            {/* Monthly cost breakdown */}
            <div style={cardS}>
              <p style={sectionHead}>Monthly Cost Breakdown</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  ["Principal & Interest", computed.monthlyPmt, false],
                  ["Property Tax", inputs.property_tax_monthly, false],
                  ["Insurance", inputs.insurance_monthly, false],
                  ...(inputs.hoa_monthly > 0 ? [["HOA", inputs.hoa_monthly, false]] : []),
                  ["Maintenance (est.)", computed.maintMonthly, false],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{String(lbl)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)" }}>{fmt(Number(val))}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Total Monthly</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(computed.totalMonthly)}</span>
                </div>
              </div>
            </div>

            {/* Effective cost vs rent */}
            <div style={cardS}>
              <p style={sectionHead}>True Ownership Cost vs Rent</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                {[
                  { label: "Gross Monthly", value: fmt(computed.totalMonthly), sub: "all in" },
                  { label: "True Effective", value: fmt(computed.trueEffectiveCost), sub: "after principal credit" },
                  { label: "Monthly Rent", value: fmt(inputs.monthly_rent), sub: "alternative" },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                True effective cost = gross monthly − principal paydown + opportunity cost on down payment ({pct(inputs.investment_return)} annual return foregone).
              </p>
            </div>

            {/* Equivalent rent threshold */}
            <div style={cardS}>
              <p style={sectionHead}>Equivalent Rent Threshold</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>
                    Renting wins if rent is below
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: 700, color: inputs.monthly_rent < computed.equivalentRent ? "oklch(0.68 0.18 25)" : "oklch(0.70 0.18 155)", lineHeight: 1 }}>
                    {fmt(computed.equivalentRent)}
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 400 }}>/mo</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {[
                    { label: "Your rent", val: `${fmt(inputs.monthly_rent)}/mo` },
                    { label: "Threshold", val: `${fmt(computed.equivalentRent)}/mo` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Spread</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: inputs.monthly_rent < computed.equivalentRent ? "oklch(0.68 0.18 25)" : "oklch(0.70 0.18 155)" }}>
                      {inputs.monthly_rent < computed.equivalentRent ? "-" : "+"}{fmt(Math.abs(computed.equivalentRent - inputs.monthly_rent))}/mo
                    </span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                {inputs.monthly_rent < computed.equivalentRent
                  ? `Your rent (${fmt(inputs.monthly_rent)}/mo) is below the threshold — renting is the better financial choice at these assumptions.`
                  : `Your rent (${fmt(inputs.monthly_rent)}/mo) exceeds the threshold — buying may offer a financial advantage.`}
                {" "}Calculated as total monthly cost minus principal paydown and appreciation credit.
              </p>
            </div>

            {/* Break-even + upfront costs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div style={cardS}>
                <p style={sectionHead}>Break-Even vs Renting</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: computed.breakEvenYear != null ? "var(--green)" : "var(--amber)" }}>
                  {computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "N/A"}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                  {computed.breakEvenYear != null
                    ? `Buying beats the rented + invested path after ${computed.breakEvenYear} ${computed.breakEvenYear === 1 ? "year" : "years"}.`
                    : `Buying doesn't out-earn the rented + invested path within ${inputs.hold_years} years at these rates.`}
                </p>
              </div>
              <div style={cardS}>
                <p style={sectionHead}>Upfront Cash Needed</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {fmt(inputs.down_payment + computed.closingCosts)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Down payment</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(inputs.down_payment)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Closing costs ({inputs.closing_cost_pct}%)</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(computed.closingCosts)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rent Breakeven Timeline */}
            {computed.timeline.length > 1 && (
              <div style={cardS}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <p style={{ ...sectionHead, margin: 0 }}>Year-by-Year: Who Wins</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#3b82f6" }} />
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Buying</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#00d395" }} />
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Renting</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {computed.timeline.slice(1).map((pt) => {
                    const buyingWins = pt.homeEquity > pt.rentPortfolio;
                    const isBreakEven = computed.breakEvenYear === pt.year;
                    const diff = Math.abs(pt.homeEquity - pt.rentPortfolio);
                    return (
                      <div
                        key={pt.year}
                        title={`Year ${pt.year}: ${buyingWins ? "Buying" : "Renting"} ahead by ${fmtK(diff)}`}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: "30px", height: "26px", borderRadius: "5px",
                          fontSize: "9px", fontWeight: isBreakEven ? 800 : 600, fontFamily: "var(--font-mono)",
                          background: isBreakEven
                            ? "rgba(255,255,255,0.12)"
                            : buyingWins
                              ? "rgba(59,130,246,0.18)"
                              : "rgba(0,211,149,0.15)",
                          color: isBreakEven
                            ? "var(--text-primary)"
                            : buyingWins
                              ? "#60a5fa"
                              : "#00d395",
                          border: isBreakEven
                            ? "1px solid rgba(255,255,255,0.25)"
                            : buyingWins
                              ? "1px solid rgba(59,130,246,0.22)"
                              : "1px solid rgba(0,211,149,0.2)",
                        }}
                      >
                        {pt.year}
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  {computed.breakEvenYear != null
                    ? `Buying overtakes renting at Year ${computed.breakEvenYear} and stays ahead. Hover any year for the equity differential.`
                    : `Renting outpaces buying throughout the ${inputs.hold_years}-year hold at current assumptions.`}
                </p>
              </div>
            )}

            {/* Opportunity Cost */}
            <div style={cardS}>
              <p style={sectionHead}>Opportunity Cost</p>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                If the {fmt(inputs.down_payment)} down payment were invested at {inputs.investment_return}%/yr instead of a home:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {computed.opportunityCost.map(({ years, value }) => (
                  <div key={years} style={{ textAlign: "center", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 6px" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "4px" }}>{years} yr</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(value)}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px" }}>{Math.round((value / inputs.down_payment - 1) * 100)}% gain</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Capital in a home is illiquid. This is the portfolio value forgone — offset by home equity growth and principal paydown over time.
              </p>
            </div>

            {/* Equity chart */}
            {computed.timeline.length > 1 && (
              <div style={cardS}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0", gap: "8px" }}>
                  <p style={{ ...sectionHead, margin: 0 }}>Net Wealth Outcome over {inputs.hold_years} Years</p>
                  {computed.lastPoint && (() => {
                    const buyWins = computed.lastPoint!.homeEquity > computed.lastPoint!.rentPortfolio;
                    const diff = Math.abs(computed.lastPoint!.homeEquity - computed.lastPoint!.rentPortfolio);
                    return (
                      <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", background: buyWins ? "rgba(59,130,246,0.10)" : "rgba(0,211,149,0.10)", color: buyWins ? "#3b82f6" : "#00d395", border: `1px solid ${buyWins ? "rgba(59,130,246,0.2)" : "rgba(0,211,149,0.2)"}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {buyWins ? "Buying" : "Renting"} ahead by {fmtK(diff)}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ height: "200px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d395" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip
                        contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v) => typeof v === "number" ? fmt(v) : String(v ?? "")}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", color: "var(--text-secondary)" }} />
                      <Area type="monotone" dataKey="Home Equity" stroke="#3b82f6" fill="url(#equityGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Invested (Rent)" stroke="#00d395" fill="url(#portfolioGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {computed.lastPoint && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                    {[
                      { label: `Equity at yr ${inputs.hold_years}`, value: fmtK(computed.lastPoint.homeEquity), color: "#3b82f6" },
                      { label: "Home value", value: fmtK(computed.lastPoint.homeValue), color: "var(--text-secondary)" },
                      { label: "Renter portfolio", value: fmtK(computed.lastPoint.rentPortfolio), color: "#00d395" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Real ownership cost over hold period */}
            {computed.lastPoint && (
              <div style={cardS}>
                <p style={sectionHead}>True Cost of Ownership over {inputs.hold_years} Years</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  {[
                    { label: "Down payment + closing", val: computed.realOwnershipCost.upfrontCashOut, color: "var(--text-primary)" },
                    { label: `Monthly payments (${inputs.hold_years} yrs)`, val: computed.realOwnershipCost.totalMonthlyCashOut, color: "var(--text-primary)" },
                    { label: "Selling costs on exit (6%)", val: computed.realOwnershipCost.sellTransactionCost, color: "oklch(0.68 0.18 25)" },
                    { label: "Less: net sale proceeds", val: -Math.max(0, computed.realOwnershipCost.netSaleProceeds), color: "oklch(0.70 0.18 155)" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "9px 11px" }}>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "3px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>
                        {val < 0 ? "-" : ""}{fmtK(Math.abs(val))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "12px" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>Net cost of owning</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(computed.realOwnershipCost.trueNetOwnershipCost)}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>cash in − sale proceeds</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>Rent path total</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: computed.realOwnershipCost.rentAlternativeTotalCost < computed.realOwnershipCost.trueNetOwnershipCost ? "oklch(0.70 0.18 155)" : "oklch(0.68 0.18 25)" }}>
                      {fmtK(computed.realOwnershipCost.rentAlternativeTotalCost)}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                      {computed.realOwnershipCost.rentAlternativeTotalCost < computed.realOwnershipCost.trueNetOwnershipCost ? "Renting is cheaper" : "Owning is cheaper"}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  Selling costs estimated at 6% (agent commissions + title). Net cost = total paid out minus proceeds recovered on sale.
                </p>
              </div>
            )}

            {/* The Case For Each Path */}
            {(computed.buyingAdvantages.length > 0 || computed.rentingAdvantages.length > 0) && (
              <div style={cardS}>
                <p style={sectionHead}>The Case For Each Path</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.70 0.18 155)", marginBottom: "8px" }}>Buying Wins If</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {computed.buyingAdvantages.length > 0 ? computed.buyingAdvantages.slice(0, 4).map((adv, i) => (
                        <div key={i} style={{ display: "flex", gap: "7px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          <span style={{ color: "oklch(0.70 0.18 155)", flexShrink: 0, fontWeight: 700, marginTop: "1px" }}>✓</span>{adv}
                        </div>
                      )) : <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontStyle: "italic" }}>No buying advantages at current inputs</div>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px" }}>Renting Wins If</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {computed.rentingAdvantages.length > 0 ? computed.rentingAdvantages.slice(0, 4).map((adv, i) => (
                        <div key={i} style={{ display: "flex", gap: "7px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          <span style={{ color: "var(--text-muted)", flexShrink: 0, fontWeight: 700, marginTop: "1px" }}>•</span>{adv}
                        </div>
                      )) : <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontStyle: "italic" }}>No renting advantages at current inputs</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FINN Home Advisor */}
            <div style={cardS}>
              <p style={sectionHead}>FINN Home Advisor</p>
              {/* What Would FINN Do? — rule-based recommendation */}
              {rankedPaths.length >= 2 && (() => {
                const top = rankedPaths[0];
                const second = rankedPaths[1];
                const scoreDiff = top.score - second.score;
                const confidence = Math.min(96, Math.max(52, 52 + scoreDiff * 2.2));
                const vColors = { BUY: "oklch(0.70 0.18 155)", WAIT: "oklch(0.80 0.14 80)", RENT: "oklch(0.68 0.18 25)" };
                const topColor = vColors[top.verdict];
                const bd = top.scoreBreakdown;
                const reasons: string[] = [];
                if (bd.retirement >= 80) reasons.push("retirement preservation");
                if (bd.affordability >= 75) reasons.push("affordability fit");
                if (bd.liquidity >= 80) reasons.push("liquidity preservation");
                if (bd.wealth >= 80) reasons.push("long-term wealth creation");
                if (bd.breakeven >= 80) reasons.push("equity break-even speed");
                const retirAdv = top.retirAssets != null && second.retirAssets != null ? top.retirAssets - second.retirAssets : null;
                return (
                  <div style={{ marginBottom: "14px", padding: "12px", borderRadius: "var(--radius-md)", background: `color-mix(in oklch, ${topColor} 5%, var(--bg-elevated))`, border: `1px solid color-mix(in oklch, ${topColor} 18%, transparent)` }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: topColor, marginBottom: "7px" }}>What Would FINN Do?</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>{top.name}</span>
                      <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: topColor, fontWeight: 700 }}>{Math.round(confidence)}% confidence</span>
                    </div>
                    {reasons.length > 0 && (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "6px" }}>
                        Best balance of {reasons.slice(0, 3).join(", ")}.
                      </div>
                    )}
                    {second && (
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.4, borderTop: `1px solid color-mix(in oklch, ${topColor} 12%, transparent)`, paddingTop: "7px" }}>
                        Alt: <span style={{ color: "var(--text-secondary)" }}>{second.name}</span>
                        {retirAdv != null && Math.abs(retirAdv) > 5000
                          ? ` — ${fmtK(Math.abs(retirAdv))} ${retirAdv > 0 ? "less" : "more"} in projected retirement assets`
                          : ` (score ${second.score})`}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Auto insight — always visible */}
              {(() => {
                const vc = { BUY: "oklch(0.70 0.18 155)", WAIT: "oklch(0.80 0.14 80)", RENT: "oklch(0.68 0.18 25)" }[computed.verdictData.verdict];
                const label = computed.verdictData.verdict === "BUY" ? "Why this looks favorable:" : computed.verdictData.verdict === "RENT" ? "Why renting wins here:" : "Key factors to weigh:";
                return (
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: vc, marginBottom: "7px" }}>{label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {computed.verdictData.reasons.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: "7px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          <span style={{ color: vc, flexShrink: 0 }}>•</span>{r}
                        </div>
                      ))}
                      {computed.breakEvenYear != null && (
                        <div style={{ display: "flex", gap: "7px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>•</span>Break-even: Year {computed.breakEvenYear} — {computed.breakEvenYear <= inputs.hold_years ? `within your ${inputs.hold_years}-year window` : `beyond your ${inputs.hold_years}-year window`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* AI deep analysis */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                {finnCommentary ? (
                  <>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 10px" }}>{finnCommentary}</p>
                    <button type="button" onClick={() => setFinnCommentary(null)} style={{ fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-body)" }}>
                      Refresh AI Analysis
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
                    {finnLoading ? "FINN is thinking…" : "Ask FINN for AI Analysis"}
                  </button>
                )}
              </div>
            </div>

            {/* Amortization schedule */}
            {computed.amortization.length > 1 && (
              <div style={cardS}>
                <button
                  type="button"
                  onClick={() => setShowAmortization((v) => !v)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, gap: "8px" }}
                >
                  <p style={{ ...sectionHead, margin: 0 }}>Amortization Schedule — Full {inputs.loan_term_years}-Year Term</p>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ transform: showAmortization ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {showAmortization && (
                  <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "14px" }}>

                    {/* Summary stats */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                      {[
                        { label: "Monthly P&I", value: fmt(computed.amortStats.monthlyPayment), color: "var(--text-primary)" },
                        { label: "Total Interest Paid", value: fmtK(computed.amortStats.totalInterest), color: "var(--red)" },
                        { label: "Principal/Interest Crossover", value: computed.amortStats.crossoverYear != null ? `Year ${computed.amortStats.crossoverYear}` : "—", color: "#3b82f6", sub: "more principal than interest paid" },
                        { label: "50% Equity Milestone", value: computed.amortStats.equity50Year != null ? `Year ${computed.amortStats.equity50Year}` : "—", color: "#00d395", sub: "home half-owned" },
                      ].map(({ label, value, color, sub }) => (
                        <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                          {sub && <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px", fontFamily: "var(--font-body)" }}>{sub}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Equity milestones strip */}
                    {(computed.amortStats.equity20Year != null || computed.amortStats.equity50Year != null || computed.amortStats.equity80Year != null) && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {[
                          { label: "20% equity", year: computed.amortStats.equity20Year, note: "drop PMI" },
                          { label: "50% equity", year: computed.amortStats.equity50Year, note: "halfway there" },
                          { label: "80% equity", year: computed.amortStats.equity80Year, note: "strong position" },
                        ].filter(m => m.year != null).map(({ label, year, note }) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "20px", background: "rgba(0,211,149,0.08)", border: "1px solid rgba(0,211,149,0.2)", fontSize: "11px", fontFamily: "var(--font-body)" }}>
                            <span style={{ color: "#00d395", fontWeight: 600 }}>Year {year}</span>
                            <span style={{ color: "var(--text-tertiary)" }}>· {label}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>({note})</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Table */}
                    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "420px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                        <thead style={{ position: "sticky", top: 0, background: "var(--card-bg)", zIndex: 1 }}>
                          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            {["Yr", "Balance", "Annual Principal", "Annual Interest", "Cum. Interest", "Home Value", "Equity", "Equity %"].map((h) => (
                              <th key={h} style={{ padding: "5px 8px 7px", textAlign: "right", color: "var(--text-muted)", fontWeight: 600, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {computed.amortization.map((row) => {
                            const isHoldYear = row.year === inputs.hold_years;
                            const isCrossover = row.isCrossover;
                            const rowBg = isHoldYear
                              ? "color-mix(in oklch, #3b82f6 8%, transparent)"
                              : isCrossover
                                ? "color-mix(in oklch, #00d395 5%, transparent)"
                                : "transparent";
                            return (
                              <tr key={row.year} style={{ borderBottom: "1px solid var(--border-subtle)", background: rowBg }}>
                                <td style={{ padding: "5px 8px", color: isHoldYear ? "#3b82f6" : "var(--text-tertiary)", textAlign: "right", fontWeight: isHoldYear ? 700 : 400 }}>
                                  {row.year}{isHoldYear ? " ★" : ""}
                                </td>
                                <td style={{ padding: "5px 8px", color: "var(--text-secondary)", textAlign: "right" }}>{row.balance < 100 ? "—" : fmtK(row.balance)}</td>
                                <td style={{ padding: "5px 8px", color: "#3b82f6", textAlign: "right" }}>{row.year === 0 ? "—" : fmtK(row.annualPrincipal)}</td>
                                <td style={{ padding: "5px 8px", color: "oklch(0.70 0.15 25)", textAlign: "right" }}>{row.year === 0 ? "—" : fmtK(row.annualInterest)}</td>
                                <td style={{ padding: "5px 8px", color: "var(--text-tertiary)", textAlign: "right" }}>{fmtK(row.cumulativeInterest)}</td>
                                <td style={{ padding: "5px 8px", color: "var(--text-secondary)", textAlign: "right" }}>{fmtK(row.homeValue)}</td>
                                <td style={{ padding: "5px 8px", color: "#00d395", textAlign: "right", fontWeight: 600 }}>{fmtK(row.equity)}</td>
                                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: row.equityPct >= 50 ? "#00d395" : row.equityPct >= 20 ? "#3b82f6" : "var(--text-tertiary)" }}>
                                  {row.year === 0 ? `${row.equityPct.toFixed(0)}%` : `${row.equityPct.toFixed(1)}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0, fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                      ★ = your planned hold year (blue). Green tint = crossover year (principal paid exceeds interest). Equity % uses projected home value with {inputs.expected_appreciation}%/yr appreciation.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Add to financial plan */}
            <div style={cardS}>
              <p style={sectionHead}>Link to Financial Plan</p>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Add this scenario as milestone events in your forecast: a down payment outlay today and the projected equity realization in year {inputs.hold_years}.
              </p>
              {applyStatus === "done" ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--green)", fontFamily: "var(--font-body)" }}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2"><path d="M4 10l5 5L16 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Added to your forecast. View in Planning &gt; Life Events.
                </div>
              ) : applyStatus === "error" ? (
                <div style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)" }}>Failed to add events. Try again.</div>
              ) : (
                <button
                  type="button"
                  disabled={applyStatus === "applying" || !computed.lastPoint}
                  onClick={async () => {
                    if (!computed.lastPoint) return;
                    setApplyStatus("applying");
                    const currentYear = new Date().getFullYear();
                    const fdDown = new FormData();
                    fdDown.set("label", `Down payment: ${inputs.name}`);
                    fdDown.set("event_year", String(currentYear));
                    fdDown.set("amount_impact", String(-(inputs.down_payment + computed.closingCosts)));
                    fdDown.set("category", "home_purchase");
                    const fdEquity = new FormData();
                    fdEquity.set("label", `Home equity sale: ${inputs.name}`);
                    fdEquity.set("event_year", String(currentYear + inputs.hold_years));
                    fdEquity.set("amount_impact", String(Math.round(computed.lastPoint.homeEquity)));
                    fdEquity.set("category", "home_sale");
                    const [r1, r2] = await Promise.all([addFutureEvent(fdDown), addFutureEvent(fdEquity)]);
                    if (r1.error || r2.error) { setApplyStatus("error"); return; }
                    setApplyStatus("done");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, cursor: "pointer", opacity: applyStatus === "applying" ? 0.6 : 1 }}
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3v14M3 10h14" strokeLinecap="round"/></svg>
                  {applyStatus === "applying" ? "Adding…" : "Add to Forecast"}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 768px) {
          [data-home-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
