"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { HomeScenario } from "./home-actions";
import { saveHomeScenario, deleteHomeScenario } from "./home-actions";
import type { FinancialProfile, FutureEvent } from "@/app/planning/planning-actions";
import { addFutureEvent, deleteFutureEvent } from "@/app/planning/planning-actions";
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

// ── FINN advisor narrative (rule-based, advisor voice) ────────────────────────

function buildFinnNarrative({
  verdict,
  totalMonthly,
  income,
  breakEvenYear,
  holdYears,
  retirDelta,
  retirBaselineAssets,
  retirWithHomeAssets,
  equivalentRent,
  monthlyRent,
}: {
  verdict: "BUY" | "WAIT" | "RENT";
  totalMonthly: number;
  income: number | null | undefined;
  breakEvenYear: number | null;
  holdYears: number;
  retirDelta: number | null;
  retirBaselineAssets: number | null;
  retirWithHomeAssets: number | null;
  equivalentRent: number;
  monthlyRent: number;
}): string {
  const f = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const sentences: string[] = [];

  if (verdict === "BUY") sentences.push("The fundamentals here lean toward buying.");
  else if (verdict === "RENT") sentences.push("At these numbers, continuing to rent is the stronger financial position.");
  else sentences.push("This is a genuinely close call — the data doesn't clearly favor one path over the other.");

  if (income && income > 0) {
    const pct = Math.round((totalMonthly / income) * 100);
    const guideline = income * 0.28;
    if (pct <= 25) sentences.push(`The ${f(totalMonthly)}/mo payment sits at ${pct}% of income — comfortably within standard guidelines.`);
    else if (pct <= 32) sentences.push(`Monthly costs run ${pct}% of income, slightly above the 28% guideline but workable with stable employment.`);
    else if (pct <= 40) sentences.push(`At ${pct}% of gross income, the payment is aggressive. The 28% rule suggests a target closer to ${f(guideline)}/mo — this level requires financial discipline to sustain.`);
    else sentences.push(`This payment — ${pct}% of gross income — creates real financial pressure. Most lenders flag this as high-risk, leaving little buffer for unexpected expenses or income disruption.`);
  }

  if (breakEvenYear != null && breakEvenYear <= holdYears) {
    const buffer = holdYears - breakEvenYear;
    if (buffer >= 3) sentences.push(`Buying crosses ahead of renting at Year ${breakEvenYear}, leaving ${buffer} years of compounding equity advantage before your planned exit — a solid margin.`);
    else sentences.push(`Break-even lands at Year ${breakEvenYear}, just ${buffer} year${buffer === 1 ? "" : "s"} inside your ${holdYears}-year window. Staying longer significantly widens the advantage.`);
  } else if (breakEvenYear != null) {
    const overshoot = breakEvenYear - holdYears;
    sentences.push(`Break-even doesn't arrive until Year ${breakEvenYear} — ${overshoot} year${overshoot === 1 ? "" : "s"} past your ${holdYears}-year plan. If relocation is possible within that window, renting preserves flexibility and likely outperforms.`);
  } else {
    sentences.push(`Renting and investing the down payment outperforms buying at every point in this ${holdYears}-year scenario. Significantly higher appreciation or a longer hold would change that calculation.`);
  }

  if (retirDelta != null && Math.abs(retirDelta) >= 3) {
    if (retirDelta > 0) sentences.push(`Home equity at year ${holdYears} is projected to improve your retirement probability by ${retirDelta}pp — the asset adds meaningfully to long-term wealth.`);
    else if (retirDelta >= -5) sentences.push(`The higher monthly cost reduces investable savings, pulling retirement probability down ${Math.abs(retirDelta)}pp. Worth watching as income grows.`);
    else sentences.push(`This purchase meaningfully pressures retirement — projected ${Math.abs(retirDelta)}pp decline in probability. The monthly cost is crowding out long-term savings at a level worth taking seriously.`);
  }

  if (retirBaselineAssets != null && retirWithHomeAssets != null) {
    const diff = retirWithHomeAssets - retirBaselineAssets;
    if (Math.abs(diff) > 10000) {
      const fk = (n: number) => { if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M"; return "$" + (Math.abs(n) / 1000).toFixed(0) + "K"; };
      if (diff > 0) sentences.push(`Total projected retirement assets are ${fk(diff)} higher with the home — home equity appreciation offsets the reduced savings rate.`);
      else sentences.push(`Projected retirement assets are ${fk(Math.abs(diff))} lower with the home, reflecting the capital tied up in the down payment and reduced monthly savings capacity.`);
    }
  }

  if (monthlyRent < equivalentRent - 100) sentences.push(`Your current rent is below the ${f(equivalentRent)}/mo economic break-even threshold — the market is pricing renting favorably at this home's cost level.`);
  else if (monthlyRent > equivalentRent + 100) sentences.push(`Your rent exceeds the ${f(equivalentRent)}/mo ownership break-even — from a pure cost perspective, owning is already competitive.`);

  return sentences.join(" ");
}

// ── Biggest risk engine ───────────────────────────────────────────────────────

type RiskItem = { title: string; body: string; severity: "high" | "medium" };

function calcBiggestRisk({
  affordabilityRatio,
  retirDelta,
  breakEvenYear,
  holdYears,
  downPct,
  purchasePrice,
  stressTests,
}: {
  affordabilityRatio: number | null;
  retirDelta: number | null;
  breakEvenYear: number | null;
  holdYears: number;
  downPct: number;
  purchasePrice: number;
  stressTests: StressLevel[] | null;
}): RiskItem {
  const f = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  if (retirDelta != null && retirDelta <= -5) return {
    title: "Retirement Under Pressure",
    body: `Buying this home is projected to reduce your retirement probability by ${Math.abs(retirDelta)} percentage points. The higher monthly cost leaves less to invest each month, and that gap compounds over decades. Consider whether rising income or appreciation assumptions can close this gap before committing.`,
    severity: "high",
  };

  if (affordabilityRatio != null && affordabilityRatio > 1.35) return {
    title: "Payment Strain",
    body: `Monthly housing costs run well above the 28% income guideline. A job disruption, rate adjustment, or unexpected large expense could make these payments difficult to sustain. Review your emergency reserves and job security before proceeding — the financial resilience scores on this page reflect this exposure directly.`,
    severity: "high",
  };

  if (breakEvenYear === null || breakEvenYear > holdYears) {
    const detail = breakEvenYear != null
      ? `Equity doesn't overtake the renting-and-investing path until Year ${breakEvenYear} — ${breakEvenYear - holdYears} year${breakEvenYear - holdYears === 1 ? "" : "s"} past your planned exit.`
      : `At current appreciation and return assumptions, the renting path stays ahead throughout your entire hold window.`;
    return {
      title: "Selling Before Break-Even",
      body: `${detail} If circumstances force a sale before that crossover — job change, family needs, or financial stress — you'll likely recover less than you paid in when accounting for transaction costs and early-stage interest. The longer you stay past break-even, the less this risk matters.`,
      severity: retirDelta !== null && retirDelta < -3 ? "high" : "medium",
    };
  }

  if (downPct < 10) return {
    title: "Thin Equity Cushion",
    body: `A down payment below 10% means starting with very little equity buffer. In a flat or declining market, you could briefly owe more than the home is worth. You'll also pay private mortgage insurance (PMI) until equity reaches 20% — typically adding ${f(Math.round(purchasePrice * 0.0075 / 12))}/mo in cost that builds no equity.`,
    severity: "medium",
  };

  if (affordabilityRatio != null && affordabilityRatio > 1.1) return {
    title: "Payment Above Guideline",
    body: `Monthly costs run modestly above the 28% income guideline — manageable with stable income but leaving a limited monthly buffer. Home repairs, a car expense, or a short income dip could create cash flow pressure. The financial resilience scores reflect how exposed this scenario is to those kinds of shocks.`,
    severity: "medium",
  };

  if (retirDelta != null && retirDelta < -2) return {
    title: "Reduced Savings Capacity",
    body: `The higher monthly cost relative to renting reduces how much you can invest each month. Over ${holdYears} years, that difference compounds meaningfully. Revisit your savings rate annually as income grows to ensure homeownership isn't permanently displacing retirement contributions.`,
    severity: "medium",
  };

  if (stressTests) {
    const worst = stressTests.reduce((a, b) => a.score < b.score ? a : b);
    if (worst.score <= 3) return {
      title: `Fragile Against ${worst.level} Shock`,
      body: `The "${worst.scenario}" scenario scores ${worst.score}/10 — indicating thin reserves relative to this mortgage. Building 6+ months of liquid reserves before closing would significantly reduce this exposure. Homeownership comes with unavoidable lumpy costs (emergency repairs, insurance gaps) that renters can walk away from.`,
      severity: "medium",
    };
  }

  return {
    title: "Transaction Cost Drag",
    body: `Buying and selling a home costs roughly 9–10% of the purchase price in friction (closing costs in, agent fees out). At ${f(purchasePrice)}, that's approximately ${f(Math.round(purchasePrice * 0.10))} that must be recovered through appreciation and equity before you break even on the transaction itself. This makes short-to-medium holds financially punishing — the longer you stay, the less it matters.`,
    severity: "medium",
  };
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
  homeEvents,
}: {
  scenarios: HomeScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  homeEvents: FutureEvent[];
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
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "done" | "error">("idle");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [showAmortModal, setShowAmortModal] = useState(false);
  const [localHomeEvents, setLocalHomeEvents] = useState<FutureEvent[]>(homeEvents);
  // ZIP lookup state
  const [dataMode, setDataMode] = useState<"preset" | "zip">("preset");
  const [zipInput, setZipInput] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipData, setZipData] = useState<import("@/app/api/planning/home-market/route").HomeMarketData | null>(null);

  async function exportAmortToCSV() {
    try {
      const res = await fetch("/api/planning/home/export-amort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs,
          amortization: computed.amortization,
          amortStats: computed.amortStats,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BuyTune_${inputs.name.replace(/\s+/g, "_")}_Amortization.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — no toast available here
    }
  }

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

  async function handleZipLookup() {
    if (!/^\d{5}$/.test(zipInput)) { setZipError("Enter a 5-digit ZIP code."); return; }
    setZipLoading(true);
    setZipError(null);
    setZipData(null);
    try {
      const res = await fetch(`/api/planning/home-market?zip=${zipInput}`);
      const data = await res.json() as import("@/app/api/planning/home-market/route").HomeMarketData & { error?: string };
      if (!res.ok || data.error) { setZipError(data.error ?? "Lookup failed. Try again."); return; }
      if (!data.censusAvailable) { setZipError("No Census data found for this ZIP. Try a nearby ZIP or use Metro Preset."); return; }
      setZipData(data);
      // Apply to inputs
      setInputs((prev) => ({
        ...prev,
        purchase_price: data.medianHomeValue ?? prev.purchase_price,
        down_payment: data.medianHomeValue ? Math.round(data.medianHomeValue * 0.2) : prev.down_payment,
        monthly_rent: data.medianRent ?? prev.monthly_rent,
        property_tax_monthly: data.monthlyPropertyTax ?? prev.property_tax_monthly,
        insurance_monthly: data.medianHomeValue
          ? Math.max(75, Math.round((data.medianHomeValue * 0.004) / 12 / 10) * 10)
          : prev.insurance_monthly,
        mortgage_rate: data.mortgageRate ?? prev.mortgage_rate,
      }));
      setSelectedPreset("");
      setFinnCommentary(null);
    } catch {
      setZipError("Network error. Check connection and try again.");
    } finally {
      setZipLoading(false);
    }
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
      homePriceRanges, readinessScore, stressTests, retirDelta: retirDeltaVal,
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
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
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
          <div data-home-sticky style={{ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: "24px" }}>

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
                      Based on {fmt(profile.monthly_income!)}/mo income · <abbr title="The 28% rule: lenders recommend your total housing payment (Principal, Interest, Taxes & Insurance) stay below 28% of gross monthly income.">28% rule</abbr> suggests max {fmt(Math.round(maxPITI))}/mo
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* What Can I Afford? */}
            {computed.homePriceRanges && (
              <div data-card style={cardS}>
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
                        onClick={() => {
                          if (isActive) return;
                          setInputs((prev) => ({
                            ...prev,
                            purchase_price: range.price,
                            down_payment: range.downPayment,
                            property_tax_monthly: Math.round((range.price * 0.012) / 12 / 10) * 10,
                            insurance_monthly: Math.max(75, Math.round((range.price * 0.004) / 12 / 10) * 10),
                          }));
                          setFinnCommentary(null);
                        }}
                        style={{
                          display: "grid", gridTemplateColumns: "100px 1fr auto", alignItems: "center", gap: "10px",
                          padding: "10px 12px", borderRadius: "var(--radius-md)",
                          background: isActive ? "color-mix(in oklch, #3b82f6 10%, var(--bg-elevated))" : "var(--bg-elevated)",
                          border: isActive ? "1px solid rgba(59,130,246,0.35)" : "1px solid transparent",
                          cursor: isActive ? "default" : "pointer",
                          transition: "background 0.15s ease, border-color 0.15s ease",
                        }}
                        className="afford-row"
                      >
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{range.label}</div>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "1px", lineHeight: 1.4 }}>
                            <span title="Debt-to-Income ratio: what % of your gross monthly income goes to debt payments. Conservative = 28%, Moderate = 33%, Aggressive = 40%.">{Math.round(range.dtiRatio * 100)}% DTI</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(range.price)}</div>
                          <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                            {fmtK(range.downPayment)} down · {fmt(range.monthlyEst)}/mo est.
                          </div>
                        </div>
                        {isActive ? (
                          <span style={{ fontSize: "10px", padding: "4px 9px", borderRadius: "6px", background: "rgba(59,130,246,0.14)", color: "#60a5fa", fontFamily: "var(--font-body)", whiteSpace: "nowrap", fontWeight: 700, letterSpacing: "0.02em" }}>
                            ✓ Active
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", padding: "4px 9px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>
                            Apply
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  Estimates assume 20% down, 1.2% tax, 0.4% insurance. Adjust inputs above for precision.
                </p>
              </div>
            )}

            {/* Location Data — Metro Preset or ZIP Lookup */}
            <div data-card style={cardS}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ ...sectionHead, margin: 0 }}>Location Data</p>
                <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--card-border)" }}>
                  {(["preset", "zip"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setDataMode(mode); setZipError(null); }}
                      style={{
                        padding: "3px 10px", fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-body)",
                        border: "none", cursor: "pointer", transition: "background 0.15s, color 0.15s",
                        background: dataMode === mode ? "var(--brand-blue)" : "transparent",
                        color: dataMode === mode ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {mode === "preset" ? "Metro" : "ZIP"}
                    </button>
                  ))}
                </div>
              </div>

              {dataMode === "preset" ? (
                <>
                  <select
                    value={selectedPreset}
                    onChange={(e) => { setSelectedPreset(e.target.value); applyPreset(e.target.value); setZipData(null); }}
                    style={{ ...inputS, fontFamily: "var(--font-body)", color: selectedPreset ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    <option value="">Custom (no preset)</option>
                    {Object.entries(MARKET_PRESETS).map(([key, p]) => (
                      <option key={key} value={key}>{p.label}</option>
                    ))}
                  </select>
                  {selectedPreset && (
                    <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                      Loaded {MARKET_PRESETS[selectedPreset]?.label} median data. Adjust any field to customize.
                    </p>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="e.g. 75201"
                      value={zipInput}
                      onChange={(e) => { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleZipLookup(); }}
                      style={{ ...inputS, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleZipLookup}
                      disabled={zipLoading || zipInput.length !== 5}
                      style={{
                        padding: "0 14px", borderRadius: "var(--radius-md)", border: "none",
                        background: zipInput.length === 5 ? "var(--brand-blue)" : "var(--bg-elevated)",
                        color: zipInput.length === 5 ? "#fff" : "var(--text-muted)",
                        fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: zipInput.length === 5 ? "pointer" : "not-allowed",
                        opacity: zipLoading ? 0.6 : 1, transition: "background 0.15s",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {zipLoading ? "…" : "Look Up"}
                    </button>
                  </div>

                  {zipError && (
                    <p style={{ fontSize: "11px", color: "var(--red)", margin: 0, lineHeight: 1.4 }}>{zipError}</p>
                  )}

                  {zipData && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {/* Source badges */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {zipData.censusAvailable && (
                          <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "10px", background: "rgba(59,130,246,0.10)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.22)", fontWeight: 600 }}>
                            Census {zipData.dataVintage}
                          </span>
                        )}
                        {zipData.fredAvailable && (
                          <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "10px", background: "rgba(59,130,246,0.10)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.22)", fontWeight: 600 }}>
                            FRED live rate
                          </span>
                        )}
                        {zipData.hudAvailable && (
                          <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "10px", background: "rgba(100,116,139,0.12)", color: "var(--text-muted)", border: "1px solid rgba(100,116,139,0.2)", fontWeight: 600 }}>
                            HUD FMR {zipData.rentSource === "hud_fmr" ? "(rent fallback)" : "(backup available)"}
                          </span>
                        )}
                      </div>

                      {/* Key data points */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        {[
                          { label: "Median Home Value", value: zipData.medianHomeValue ? `$${(zipData.medianHomeValue / 1000).toFixed(0)}K` : "—" },
                          { label: `Median Rent${zipData.rentSource === "hud_fmr" ? " (HUD 2BR)" : ""}`, value: zipData.medianRent ? `$${zipData.medianRent.toLocaleString()}/mo` : "—" },
                          { label: "30-yr Rate (live)", value: zipData.mortgageRate ? `${zipData.mortgageRate}%` : "—" },
                          { label: "Effective Tax Rate", value: zipData.effectiveTaxRatePct ? `${zipData.effectiveTaxRatePct}%/yr` : "—" },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                            <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>{label}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Buy vs rent signal */}
                      {zipData.buyRentSignal && (
                        <div style={{
                          padding: "6px 10px", borderRadius: "var(--radius-md)", fontSize: "11px",
                          background: zipData.buyRentSignal === "strongly_buy" || zipData.buyRentSignal === "lean_buy"
                            ? "color-mix(in oklch, oklch(0.70 0.18 155) 8%, transparent)"
                            : zipData.buyRentSignal === "strongly_rent" || zipData.buyRentSignal === "lean_rent"
                            ? "color-mix(in oklch, oklch(0.68 0.18 25) 8%, transparent)"
                            : "color-mix(in oklch, oklch(0.80 0.14 80) 8%, transparent)",
                          color: zipData.buyRentSignal === "strongly_buy" || zipData.buyRentSignal === "lean_buy"
                            ? "oklch(0.75 0.15 155)"
                            : zipData.buyRentSignal === "strongly_rent" || zipData.buyRentSignal === "lean_rent"
                            ? "oklch(0.75 0.12 25)"
                            : "oklch(0.80 0.14 80)",
                          border: "1px solid currentColor",
                          opacity: 0.9,
                        }}>
                          ZIP {zipData.zip} price-to-rent {zipData.priceToRentRatio}x —{" "}
                          {{ strongly_buy: "strongly favors buying", lean_buy: "leans toward buying", neutral: "neutral market", lean_rent: "leans toward renting", strongly_rent: "strongly favors renting" }[zipData.buyRentSignal]}
                        </div>
                      )}

                      <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                        Applied to inputs above. Adjust any field to customize. Appreciation rate kept from prior inputs.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Property */}
            <div data-card style={cardS}>
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
            <div data-card style={cardS}>
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
            <div data-card style={cardS}>
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
            <div data-card style={cardS}>
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
            <div data-card style={cardS}>
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

            {/* ── SECTION: ANALYSIS ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Analysis</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Financial Resilience (Stress Test) */}
            {computed.stressTests && (() => {
              const tests = computed.stressTests;
              const avgScore = Math.round(tests.reduce((s, t) => s + t.score, 0) / tests.length);
              const scoreColor = (s: number) => s >= 7 ? "oklch(0.70 0.18 155)" : s >= 5 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)";
              const strongest = tests.reduce((a, b) => a.score > b.score ? a : b);
              const weakest = tests.reduce((a, b) => a.score < b.score ? a : b);
              const avgColor = scoreColor(avgScore);
              return (
                <div data-card style={cardS}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Financial Resilience</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Avg</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: avgColor }}>{avgScore}/10</span>
                    </div>
                  </div>
                  {/* Strength / Weakness summary */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    <div style={{ padding: "9px 11px", borderRadius: "var(--radius-md)", background: "color-mix(in oklch, oklch(0.70 0.18 155) 6%, var(--bg-elevated))", border: "1px solid color-mix(in oklch, oklch(0.70 0.18 155) 18%, transparent)" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "oklch(0.70 0.18 155)", marginBottom: "4px" }}>Primary Strength</div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{strongest.level} Shock</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.3 }}>{strongest.scenario} — score {strongest.score}/10</div>
                    </div>
                    <div style={{ padding: "9px 11px", borderRadius: "var(--radius-md)", background: `color-mix(in oklch, ${scoreColor(weakest.score)} 6%, var(--bg-elevated))`, border: `1px solid color-mix(in oklch, ${scoreColor(weakest.score)} 18%, transparent)` }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: scoreColor(weakest.score), marginBottom: "4px" }}>Primary Weakness</div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{weakest.level} Shock</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.3 }}>{weakest.scenario} — score {weakest.score}/10</div>
                    </div>
                  </div>
                  {/* Why the score is what it is */}
                  <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "0 0 12px", lineHeight: 1.55 }}>
                    These scores measure how well your estimated reserves absorb housing shocks — not your readiness to buy. A score of 10 means full coverage; below 5 means exposure that could strain payments.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {tests.map((t) => {
                      const color = scoreColor(t.score);
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
                  {/* Surprise Costs */}
                  <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "9px" }}>Homeownership Surprise Costs</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {[
                        { item: "HVAC replacement",         range: "$5,000 – $12,000",  freq: "10–15 yr life" },
                        { item: "Roof replacement",         range: "$8,000 – $25,000",  freq: "20–25 yr life" },
                        { item: "Water heater",             range: "$1,000 – $3,000",   freq: "8–12 yr life" },
                        { item: "Plumbing emergency",       range: "$500 – $5,000",     freq: "unpredictable" },
                        { item: "Foundation / structural",  range: "$5,000 – $30,000+", freq: "rare, severe" },
                      ].map(({ item, range, freq }) => (
                        <div key={item} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px" }}>
                          <span style={{ flex: 1, color: "var(--text-secondary)" }}>{item}</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 600 }}>{range}</span>
                          <span style={{ color: "var(--text-muted)", width: "90px", textAlign: "right" }}>{freq}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                      Your {inputs.maintenance_pct}% annual maintenance reserve (${Math.round((inputs.purchase_price * inputs.maintenance_pct / 100))}/yr estimated) helps cover these — but major items can still exceed annual reserves.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* The Case For Each Path */}
            {(computed.buyingAdvantages.length > 0 || computed.rentingAdvantages.length > 0) && (
              <div data-card style={cardS}>
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

            {/* Link to Financial Plan */}
            {(() => {
              const scenarioDownLabel = `Down payment: ${inputs.name}`;
              const scenarioSaleLabel = `Home equity sale: ${inputs.name}`;
              const linkedEvents = localHomeEvents.filter(
                (e) => e.label === scenarioDownLabel || e.label === scenarioSaleLabel,
              );
              const otherEvents = localHomeEvents.filter(
                (e) => e.label !== scenarioDownLabel && e.label !== scenarioSaleLabel,
              );

              async function addScenarioEvents() {
                if (!computed.lastPoint) return;
                setApplyStatus("applying");
                const currentYear = new Date().getFullYear();
                const fdDown = new FormData();
                fdDown.set("label", scenarioDownLabel);
                fdDown.set("event_year", String(currentYear));
                fdDown.set("amount_impact", String(-(inputs.down_payment + computed.closingCosts)));
                fdDown.set("category", "home_purchase");
                const fdEquity = new FormData();
                fdEquity.set("label", scenarioSaleLabel);
                fdEquity.set("event_year", String(currentYear + inputs.hold_years));
                fdEquity.set("amount_impact", String(Math.round(computed.lastPoint.homeEquity)));
                fdEquity.set("category", "home_sale");
                const [r1, r2] = await Promise.all([addFutureEvent(fdDown), addFutureEvent(fdEquity)]);
                if (r1.error || r2.error) { setApplyStatus("error"); return; }
                // Optimistically add to local state (use temp IDs until router refresh)
                const now = Date.now();
                setLocalHomeEvents((prev) => [
                  ...prev,
                  { id: `tmp-${now}-1`, user_id: "", label: scenarioDownLabel, event_year: currentYear, amount_impact: -(inputs.down_payment + computed.closingCosts), category: "home_purchase", sort_order: 0 },
                  { id: `tmp-${now}-2`, user_id: "", label: scenarioSaleLabel, event_year: currentYear + inputs.hold_years, amount_impact: Math.round(computed.lastPoint.homeEquity), category: "home_sale", sort_order: 1 },
                ]);
                setApplyStatus("done");
              }

              async function removeEvent(id: string) {
                const result = await deleteFutureEvent(id);
                if (!result.error) setLocalHomeEvents((prev) => prev.filter((e) => e.id !== id));
              }

              async function handleUpdateEvents() {
                setApplyStatus("applying");
                // Delete existing linked events then re-add
                await Promise.all(linkedEvents.map((e) => deleteFutureEvent(e.id)));
                setLocalHomeEvents((prev) => prev.filter((e) => e.label !== scenarioDownLabel && e.label !== scenarioSaleLabel));
                await addScenarioEvents();
              }

              const fmtImpact = (n: number) => {
                const abs = Math.abs(n);
                const sign = n < 0 ? "-" : "+";
                if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
                if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
                return `${sign}$${abs.toFixed(0)}`;
              };

              return (
                <div data-card style={cardS}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Link to Financial Plan</p>
                    {linkedEvents.length > 0 && (
                      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "2px 7px", borderRadius: "10px", background: "color-mix(in oklch, oklch(0.70 0.18 155) 10%, transparent)", color: "oklch(0.70 0.18 155)", border: "1px solid color-mix(in oklch, oklch(0.70 0.18 155) 25%, transparent)" }}>
                        Linked
                      </span>
                    )}
                  </div>

                  {linkedEvents.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Linked events list */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {linkedEvents.map((ev) => (
                          <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: ev.amount_impact < 0 ? "oklch(0.68 0.18 25)" : "oklch(0.70 0.18 155)" }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "11px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.label}</div>
                              <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Year {ev.event_year}</div>
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: ev.amount_impact < 0 ? "oklch(0.68 0.18 25)" : "oklch(0.70 0.18 155)", flexShrink: 0 }}>
                              {fmtImpact(ev.amount_impact)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEvent(ev.id)}
                              title="Remove event"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", borderRadius: "4px", flexShrink: 0, lineHeight: 1, transition: "color 0.15s" }}
                            >
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {/* Update button */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          disabled={applyStatus === "applying" || !computed.lastPoint}
                          onClick={handleUpdateEvents}
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 500, cursor: "pointer", opacity: applyStatus === "applying" ? 0.6 : 1 }}
                        >
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {applyStatus === "applying" ? "Updating…" : "Update with current inputs"}
                        </button>
                        {applyStatus === "error" && <span style={{ fontSize: "10px", color: "var(--red)" }}>Failed — try again</span>}
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                        Events appear on the Life Events tab in Planning. Click "Update" if you changed the price, rate, or hold period.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
                        Add this scenario as milestone events in your forecast: a down payment outlay today and the projected equity realization in year {inputs.hold_years}.
                      </p>
                      {applyStatus === "error" ? (
                        <div style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)" }}>Failed to add events. Try again.</div>
                      ) : (
                        <button
                          type="button"
                          disabled={applyStatus === "applying" || !computed.lastPoint}
                          onClick={addScenarioEvents}
                          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, cursor: "pointer", opacity: applyStatus === "applying" ? 0.6 : 1, width: "fit-content" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3v14M3 10h14" strokeLinecap="round"/></svg>
                          {applyStatus === "applying" ? "Adding…" : "Add to Forecast"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Other scenarios' events */}
                  {otherEvents.length > 0 && (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "6px" }}>Other linked scenarios</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {otherEvents.map((ev) => (
                          <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: "10px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.label}</div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>{fmtImpact(ev.amount_impact)}</span>
                            <button
                              type="button"
                              onClick={() => removeEvent(ev.id)}
                              title="Remove"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", flexShrink: 0, lineHeight: 1 }}
                            >
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── SECTION: LOAN BREAKDOWN ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Loan Breakdown</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Amortization — always open */}
            {computed.amortization.length > 1 && (
              <div data-card style={cardS}>
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ ...sectionHead, margin: "0 0 4px" }}>How Your Loan Pays Down</p>
                  <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
                    Each payment splits between principal (building equity you keep) and interest (cost of borrowing). Early on, most goes to interest — it shifts over time.
                  </p>
                </div>

                {/* Summary stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "14px" }}>
                  {[
                    { label: "Monthly Payment (P&I)", value: fmt(computed.amortStats.monthlyPayment), color: "var(--text-primary)", sub: "principal + interest only", tip: "Does not include property tax, insurance, or HOA — just the loan payment." },
                    { label: "Total Interest Paid", value: fmtK(computed.amortStats.totalInterest), color: "oklch(0.68 0.18 25)", sub: "over full loan term", tip: "The extra cost of borrowing over the life of the loan, on top of the home price." },
                    { label: "More Going to You", value: computed.amortStats.crossoverYear != null ? `Year ${computed.amortStats.crossoverYear}` : "—", color: "#3b82f6", sub: "principal beats interest", tip: "The year your payment starts building more equity than it costs in interest. Before this year, the bank is the primary beneficiary of your payment." },
                    { label: "Halfway Home", value: computed.amortStats.equity50Year != null ? `Year ${computed.amortStats.equity50Year}` : "—", color: "#00d395", sub: "loan half paid off", tip: "The year your remaining loan balance drops to 50% of the original loan amount — the halfway point to owning it outright." },
                  ].map(({ label, value, color, sub, tip }) => (
                    <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px", fontFamily: "var(--font-body)" }}>
                        {label}
                        <span className="has-tip" data-tip={tip}>i</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                      {sub && <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px", fontFamily: "var(--font-body)" }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Equity milestones */}
                {(computed.amortStats.equity20Year != null || computed.amortStats.equity50Year != null || computed.amortStats.equity80Year != null) && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                    {[
                      { label: "20% equity", year: computed.amortStats.equity20Year, note: "can drop PMI" },
                      { label: "50% equity", year: computed.amortStats.equity50Year, note: "halfway" },
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

                {/* Table controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginBottom: "8px" }}>
                  <button
                    onClick={exportAmortToCSV}
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: "11px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 14l6 5 6-5M10 2v17" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Export .xlsx
                  </button>
                  <button
                    onClick={() => setShowAmortModal(true)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "var(--radius-md)", border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", fontSize: "11px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h5M3 3v5M3 3l6 6M17 17h-5M17 17v-5M17 17l-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Full Table
                  </button>
                </div>

                {/* Table */}
                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "340px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    <thead style={{ position: "sticky", top: 0, background: "#091525", zIndex: 1 }}>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        {["Yr", "Balance", "Principal Paid", "Interest Paid", "Total Interest", "Home Value", "Equity", "Equity %"].map((h) => (
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
                          : isCrossover ? "color-mix(in oklch, #00d395 5%, transparent)" : "transparent";
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
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                  ★ = your planned hold year (blue). Green rows = when principal exceeds interest paid — more of your payment starts building equity than paying borrowing costs.
                </p>
              </div>
            )}

          </div>

          {/* ── RIGHT: Analysis ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* ── BuyTune Verdict — hero ── */}
            {(() => {
              const v = computed.verdictData;
              const palette = {
                BUY:  { text: "oklch(0.70 0.18 155)", bg: "color-mix(in oklch, oklch(0.70 0.18 155) 8%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.70 0.18 155) 25%, transparent)" },
                WAIT: { text: "oklch(0.80 0.14 80)",  bg: "color-mix(in oklch, oklch(0.80 0.14 80)  8%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.80 0.14 80)  22%, transparent)" },
                RENT: { text: "oklch(0.68 0.18 25)",  bg: "color-mix(in oklch, oklch(0.68 0.18 25)  8%, var(--card-bg))", border: "color-mix(in oklch, oklch(0.68 0.18 25)  22%, transparent)" },
              };
              const confPalette = {
                High:   { bg: "rgba(0,211,149,0.10)",   text: "#00d395",           border: "rgba(0,211,149,0.25)" },
                Medium: { bg: "rgba(245,158,11,0.10)",  text: "#f59e0b",           border: "rgba(245,158,11,0.25)" },
                Low:    { bg: "rgba(148,163,184,0.10)", text: "var(--text-muted)", border: "rgba(148,163,184,0.2)" },
              };
              const c = palette[v.verdict];
              const cc = confPalette[v.confidence];
              return (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--radius-lg)", padding: "20px 20px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>BuyTune Verdict</span>
                    <span title="How strongly the data supports this verdict. High = clear signal. Medium = worth watching. Low = inputs produce a mixed picture." style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "20px", background: cc.bg, color: cc.text, border: `1px solid ${cc.border}`, fontFamily: "var(--font-body)", cursor: "help" }}>
                      {v.confidence} Confidence
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "56px", fontWeight: 800, color: c.text, letterSpacing: "-2px", lineHeight: 1, marginBottom: "16px" }}>
                    {v.verdict}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "12px" }}>
                    {v.reasons.map((reason, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                        <span style={{ color: c.text, flexShrink: 0, fontWeight: 700, marginTop: "1px", fontSize: "11px" }}>{v.verdict === "RENT" ? "×" : "✓"}</span>
                        {reason}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid color-mix(in oklch, ${c.text} 12%, transparent)`, paddingTop: "8px" }}>
                    <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                      Live analysis — updates automatically as you adjust inputs.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── Best Financial Outcome ── */}
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

            {/* ── SECTION: BREAKEVEN & TIMELINE ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Breakeven &amp; Timeline</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Rent Breakeven Timeline — moved up */}
            {computed.timeline.length > 1 && (
              <div data-card style={cardS}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
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
                          width: "32px", height: "28px", borderRadius: "6px",
                          fontSize: "9px", fontWeight: isBreakEven ? 800 : 600, fontFamily: "var(--font-mono)",
                          background: isBreakEven
                            ? "rgba(255,255,255,0.12)"
                            : buyingWins ? "rgba(59,130,246,0.16)" : "rgba(0,211,149,0.13)",
                          color: isBreakEven ? "var(--text-primary)" : buyingWins ? "#60a5fa" : "#00d395",
                          border: isBreakEven
                            ? "1px solid rgba(255,255,255,0.28)"
                            : buyingWins ? "1px solid rgba(59,130,246,0.25)" : "1px solid rgba(0,211,149,0.22)",
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

            {/* Break-Even Year + Upfront Costs — 2-col */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div data-card style={cardS}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                  <p style={{ ...sectionHead, margin: 0 }}>Break-Even vs Renting</p>
                  <span className="has-tip" data-tip="The year when buying a home becomes financially better than renting + investing your down payment. Before this point, the renter would have more wealth.">i</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: computed.breakEvenYear != null ? "var(--green)" : "var(--amber)" }}>
                  {computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "N/A"}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                  {computed.breakEvenYear != null
                    ? `Buying beats the rented + invested path after ${computed.breakEvenYear} ${computed.breakEvenYear === 1 ? "year" : "years"}.`
                    : `Buying doesn't out-earn the rented + invested path within ${inputs.hold_years} years at these rates.`}
                </p>
              </div>
              <div data-card style={cardS}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                  <p style={{ ...sectionHead, margin: 0 }}>Upfront Cash Needed</p>
                  <span className="has-tip" data-tip="The total money you need on closing day before you get the keys. This includes your down payment plus closing costs (lender fees, title, escrow, etc.).">i</span>
                </div>
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

            {/* ── SECTION: RETIREMENT & HEALTH ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Retirement &amp; Health</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Retirement Impact Centerpiece */}
            {computed.retirBaselineProb != null && (
              <div data-card style={cardS}>
                <p style={sectionHead}>Retirement Impact</p>
                {/* Dollar diff as hero — only when asset data is available */}
                {computed.retirBaselineAssets != null && computed.retirWithHomeAssets != null && (() => {
                  const diff = computed.retirWithHomeAssets - computed.retirBaselineAssets;
                  const isPositive = diff >= 0;
                  const heroColor = isPositive ? "oklch(0.70 0.18 155)" : "oklch(0.68 0.18 25)";
                  const heroBg = isPositive
                    ? "color-mix(in oklch, oklch(0.70 0.18 155) 6%, var(--bg-elevated))"
                    : "color-mix(in oklch, oklch(0.68 0.18 25) 6%, var(--bg-elevated))";
                  const probColor = computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb
                    ? "oklch(0.70 0.18 155)" : "oklch(0.68 0.18 25)";
                  const probDelta = computed.retirWithHomeProb != null ? computed.retirWithHomeProb - computed.retirBaselineProb : null;
                  return (
                    <>
                      {/* Primary: dollar impact */}
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "14px", padding: "14px 16px", borderRadius: "var(--radius-md)", background: heroBg, border: `1px solid color-mix(in oklch, ${heroColor} 18%, transparent)` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                            {isPositive ? "Projected Retirement Advantage" : "Projected Retirement Cost"}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "36px", fontWeight: 800, color: heroColor, lineHeight: 1 }}>
                              {isPositive ? "+" : ""}{fmtK(diff)}
                            </span>
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>in projected retirement assets</div>
                        </div>
                        {/* Secondary: probability comparison */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>Retirement Probability</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600 }}>{computed.retirBaselineProb}%</span>
                            <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M1 5h14M9 1l5 4-5 4" stroke={probColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: probColor, fontWeight: 700 }}>{computed.retirWithHomeProb ?? "—"}%</span>
                          </div>
                          {probDelta != null && (
                            <div style={{ fontSize: "10px", color: probColor, marginTop: "3px", fontFamily: "var(--font-mono)" }}>
                              {probDelta >= 0 ? "+" : ""}{probDelta}pp
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Asset breakdown row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                        {[
                          { label: "Without Home", val: computed.retirBaselineAssets!, color: "var(--text-secondary)" },
                          { label: `With Home`, val: computed.retirWithHomeAssets!, color: isPositive ? "oklch(0.70 0.18 155)" : "oklch(0.68 0.18 25)" },
                          { label: "Difference", val: diff, color: heroColor, prefix: isPositive ? "+" : "" },
                        ].map(({ label, val, color, prefix = "" }) => (
                          <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "9px 11px", textAlign: "center" }}>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{prefix}{fmtK(Math.abs(val))}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
                {/* Fallback: probability only (no planning profile assets) */}
                {(computed.retirBaselineAssets == null || computed.retirWithHomeAssets == null) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "16px", marginBottom: "14px" }}>
                    <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "14px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>Without Home</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700, color: "var(--text-secondary)", lineHeight: 1 }}>{computed.retirBaselineProb}%</div>
                    </div>
                    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                      <path d="M1 6h18M13 1l6 5-6 5" stroke={computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "14px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>With Home</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700, color: computed.retirWithHomeProb != null && computed.retirWithHomeProb >= computed.retirBaselineProb ? "oklch(0.70 0.18 155)" : "oklch(0.78 0.15 80)", lineHeight: 1 }}>
                        {computed.retirWithHomeProb ?? "—"}%
                      </div>
                    </div>
                  </div>
                )}
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0", lineHeight: 1.5 }}>
                  Based on your planning profile. Home equity at year {inputs.hold_years} counted as a retirement asset alongside reduced savings capacity.
                </p>
              </div>
            )}

            {/* Affordability + Readiness — side by side */}
            {(computed.affordabilityScore || computed.readinessScore) && (
              <div style={{ display: "grid", gridTemplateColumns: computed.affordabilityScore && computed.readinessScore ? "1fr 1fr" : "1fr", gap: "14px", alignItems: "start" }}>
                {computed.affordabilityScore && (() => {
                  const { score, rating, components } = computed.affordabilityScore;
                  const scoreColor = score >= 90 ? "oklch(0.70 0.18 155)" : score >= 75 ? "oklch(0.80 0.14 80)" : score >= 60 ? "oklch(0.72 0.18 55)" : "oklch(0.68 0.18 25)";
                  const ratingStyle = {
                    bg: score >= 90 ? "rgba(0,211,149,0.10)" : score >= 75 ? "rgba(245,158,11,0.10)" : score >= 60 ? "rgba(249,115,22,0.10)" : "rgba(239,68,68,0.10)",
                    border: score >= 90 ? "rgba(0,211,149,0.25)" : score >= 75 ? "rgba(245,158,11,0.25)" : score >= 60 ? "rgba(249,115,22,0.25)" : "rgba(239,68,68,0.25)",
                  };
                  return (
                    <div data-card style={cardS}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                        <p style={{ ...sectionHead, margin: 0 }}>Affordability</p>
                        <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "20px", background: ratingStyle.bg, color: scoreColor, border: `1px solid ${ratingStyle.border}`, fontFamily: "var(--font-body)" }}>
                          {rating}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginBottom: "10px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "44px", fontWeight: 800, lineHeight: 1, color: scoreColor }}>{score}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                      </div>
                      <div style={{ height: "5px", borderRadius: "2.5px", background: "var(--border-subtle)", marginBottom: "12px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${score}%`, borderRadius: "2.5px", background: scoreColor, transition: "width 0.4s ease" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {components.map(({ label, score: cs, detail }) => {
                          const cColor = cs >= 80 ? "oklch(0.70 0.18 155)" : cs >= 55 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)";
                          return (
                            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 48px 22px", alignItems: "center", gap: "7px" }}>
                              <div>
                                <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{label}</div>
                                <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "1px", lineHeight: 1.3 }}>{detail}</div>
                              </div>
                              <div style={{ height: "3px", borderRadius: "1.5px", background: "var(--border-subtle)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${cs}%`, borderRadius: "1.5px", background: cColor }} />
                              </div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: cColor, textAlign: "right" }}>{cs}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {computed.readinessScore && (() => {
                  const { score, rating, components } = computed.readinessScore;
                  const rColor = score >= 90 ? "oklch(0.70 0.18 155)" : score >= 75 ? "oklch(0.80 0.14 80)" : score >= 60 ? "oklch(0.72 0.18 55)" : "oklch(0.68 0.18 25)";
                  const rBadge = {
                    bg: score >= 90 ? "rgba(0,211,149,0.10)" : score >= 75 ? "rgba(245,158,11,0.10)" : score >= 60 ? "rgba(249,115,22,0.10)" : "rgba(239,68,68,0.10)",
                    border: score >= 90 ? "rgba(0,211,149,0.25)" : score >= 75 ? "rgba(245,158,11,0.25)" : score >= 60 ? "rgba(249,115,22,0.25)" : "rgba(239,68,68,0.25)",
                  };
                  return (
                    <div data-card style={cardS}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                        <p style={{ ...sectionHead, margin: 0 }}>Readiness</p>
                        <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "20px", background: rBadge.bg, color: rColor, border: `1px solid ${rBadge.border}`, fontFamily: "var(--font-body)" }}>
                          {rating}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginBottom: "10px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "44px", fontWeight: 800, lineHeight: 1, color: rColor }}>{score}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                      </div>
                      <div style={{ height: "5px", borderRadius: "2.5px", background: "var(--border-subtle)", marginBottom: "12px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${score}%`, borderRadius: "2.5px", background: rColor, transition: "width 0.4s ease" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {components.map(({ label, score: cs, detail }) => {
                          const cColor = cs >= 80 ? "oklch(0.70 0.18 155)" : cs >= 55 ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)";
                          return (
                            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 48px 22px", alignItems: "center", gap: "7px" }}>
                              <div>
                                <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{label}</div>
                                <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "1px", lineHeight: 1.3 }}>{detail}</div>
                              </div>
                              <div style={{ height: "3px", borderRadius: "1.5px", background: "var(--border-subtle)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${cs}%`, borderRadius: "1.5px", background: cColor }} />
                              </div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: cColor, textAlign: "right" }}>{cs}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Affordability vs Readiness — contextual explanation */}
            {computed.affordabilityScore && computed.readinessScore && (() => {
              const aScore = computed.affordabilityScore!.score;
              const rScore = computed.readinessScore!.score;
              const diverges = Math.abs(aScore - rScore) >= 15;
              if (!diverges) return null;
              const highReady = rScore > aScore;
              return (
                <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "6px" }}>
                    Why these two scores differ
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {highReady
                      ? `Readiness (${rScore}) is higher than Affordability (${aScore}) — you have the financial foundation (savings, down payment, reserves) to handle homeownership, but the monthly payment is stretched relative to your income. Both scores matter: Readiness asks "Am I prepared?", Affordability asks "Can I comfortably sustain this payment?"`
                      : `Affordability (${aScore}) is higher than Readiness (${rScore}) — the monthly payment fits your income well, but your overall financial position (savings, down payment strength, emergency reserves) needs more time to build. Think of Readiness as the runway you need before comfortably taking on the responsibilities of owning.`
                    }
                  </p>
                </div>
              );
            })()}

            {/* ── SECTION: COST ANALYSIS ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Cost Analysis</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Monthly cost breakdown */}
            {(() => {
              const costItems: { label: string; value: number; color: string; dotColor: string }[] = [
                { label: "Principal & Interest", value: computed.monthlyPmt, color: "rgba(59,130,246,0.15)", dotColor: "#3b82f6" },
                { label: "Property Tax", value: inputs.property_tax_monthly, color: "rgba(168,85,247,0.12)", dotColor: "#a855f7" },
                { label: "Insurance", value: inputs.insurance_monthly, color: "rgba(245,158,11,0.12)", dotColor: "#f59e0b" },
                ...(inputs.hoa_monthly > 0 ? [{ label: "HOA", value: inputs.hoa_monthly, color: "rgba(20,184,166,0.12)", dotColor: "#14b8a6" }] : []),
                { label: "Maintenance (est.)", value: computed.maintMonthly, color: "rgba(148,163,184,0.08)", dotColor: "#94a3b8" },
              ];
              const total = costItems.reduce((s, i) => s + i.value, 0);
              return (
                <div data-card style={cardS}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Monthly Cost Breakdown</p>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(total)}</span>
                  </div>
                  {/* Stacked proportion bar */}
                  <div style={{ display: "flex", height: "6px", borderRadius: "4px", overflow: "hidden", marginBottom: "14px", gap: "1px" }}>
                    {costItems.map(({ label, value, dotColor }) => (
                      <div key={label} style={{ flex: value, background: dotColor, opacity: 0.8 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {costItems.map(({ label, value, color, dotColor }) => {
                      const pctOfTotal = total > 0 ? (value / total) * 100 : 0;
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 10px", borderRadius: "var(--radius-sm, 6px)", background: color }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{label}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", width: "34px", textAlign: "right" }}>{pctOfTotal.toFixed(0)}%</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", width: "60px", textAlign: "right" }}>{fmt(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Cash Remaining After Housing */}
                  {profile?.monthly_income && profile.monthly_income > 0 && (() => {
                    const cashLeft = profile.monthly_income! - total;
                    const isPositive = cashLeft > 0;
                    const cashColor = cashLeft >= profile.monthly_income! * 0.30 ? "oklch(0.70 0.18 155)"
                      : cashLeft >= profile.monthly_income! * 0.15 ? "oklch(0.80 0.14 80)"
                      : cashLeft >= 0 ? "oklch(0.68 0.18 25)"
                      : "oklch(0.65 0.20 25)";
                    return (
                      <div style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md)", background: `color-mix(in oklch, ${cashColor} 6%, var(--bg-elevated))`, border: `1px solid color-mix(in oklch, ${cashColor} 20%, transparent)` }}>
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "2px" }}>Cash Remaining After Housing</div>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                            {isPositive ? `${Math.round((cashLeft / profile.monthly_income!) * 100)}% of income available for savings, living, and other goals` : "Housing costs exceed gross income"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 800, color: cashColor, lineHeight: 1 }}>
                            {isPositive ? "+" : ""}{fmt(cashLeft)}
                          </span>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>/mo</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Effective cost vs rent */}
            <div data-card style={cardS}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                <p style={{ ...sectionHead, margin: 0 }}>True Ownership Cost vs Rent</p>
                <span className="has-tip" data-tip="Your 'true' monthly cost is lower than the gross payment because each month you're building equity (principal paydown) — that money stays yours. This compares the real cost of owning vs. just renting.">i</span>
              </div>
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
            <div data-card style={cardS}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                <p style={{ ...sectionHead, margin: 0 }}>Equivalent Rent Threshold</p>
                <span className="has-tip" data-tip="If your actual rent is below this number, renting is the smarter financial move. Above it, buying starts to look better. This accounts for equity buildup and appreciation.">i</span>
              </div>
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

            {/* Opportunity Cost */}
            <div data-card style={cardS}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                <p style={{ ...sectionHead, margin: 0 }}>Opportunity Cost</p>
                <span className="has-tip" data-tip="Money tied up in a home can't be invested elsewhere. This shows what your down payment could grow to in the stock market — the financial cost of choosing to buy rather than invest.">i</span>
              </div>
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

            {/* ── SECTION: PROJECTION ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Projection</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Home Value Projection */}
            {computed.lastPoint && (
              <div data-card style={cardS}>
                <p style={{ ...sectionHead, marginBottom: "14px" }}>Home Value Projection</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {[
                    { label: "Today", value: fmt(inputs.purchase_price), color: "var(--text-primary)", sub: "purchase price" },
                    { label: `Year ${inputs.hold_years}`, value: fmt(computed.lastPoint.homeValue), color: "#3b82f6", sub: `at ${inputs.expected_appreciation}%/yr appreciation` },
                    { label: "Projected Gain", value: `+${fmt(computed.lastPoint.homeValue - inputs.purchase_price)}`, color: "oklch(0.70 0.18 155)", sub: `+${((computed.lastPoint.homeValue / inputs.purchase_price - 1) * 100).toFixed(0)}% total` },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "12px" }}>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "5px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "4px" }}>{sub}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  Appreciation is compounded annually. Actual value depends on local market conditions, maintenance, and home improvements over the hold period.
                </p>
              </div>
            )}

            {/* Equity chart */}
            {computed.timeline.length > 1 && (
              <div data-card style={cardS}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Net Wealth Outcome over {inputs.hold_years} Years</p>
                    <span className="has-tip" data-tip="Buying path = home equity after selling. Renting path = what your down payment would be worth if invested instead. This shows which path leaves you wealthier.">i</span>
                  </div>
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
              <div data-card style={cardS}>
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

            {/* ── SECTION: INTELLIGENCE ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
              <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Intelligence</span>
              <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* FINN Home Advisor */}
            <div data-card style={cardS}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <p style={{ ...sectionHead, margin: 0 }}>FINN Home Advisor</p>
                <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "20px", background: "rgba(109,40,217,0.08)", color: "#7c3aed", border: "1px solid rgba(109,40,217,0.2)" }}>Rule-Based</span>
              </div>
              {/* Advisor opinion paragraph */}
              {(() => {
                const narrative = buildFinnNarrative({
                  verdict: computed.verdictData.verdict,
                  totalMonthly: computed.totalMonthly,
                  income: profile?.monthly_income,
                  breakEvenYear: computed.breakEvenYear,
                  holdYears: inputs.hold_years,
                  retirDelta: computed.retirDelta,
                  retirBaselineAssets: computed.retirBaselineAssets,
                  retirWithHomeAssets: computed.retirWithHomeAssets,
                  equivalentRent: computed.equivalentRent,
                  monthlyRent: inputs.monthly_rent,
                });
                const vc = { BUY: "oklch(0.70 0.18 155)", WAIT: "oklch(0.80 0.14 80)", RENT: "oklch(0.68 0.18 25)" }[computed.verdictData.verdict];
                return (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, margin: "0 0 14px", borderLeft: `2px solid color-mix(in oklch, ${vc} 35%, transparent)`, paddingLeft: "12px" }}>
                    {narrative}
                  </p>
                );
              })()}
              {/* Supporting signals */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "14px" }}>
                {computed.verdictData.reasons.map((r, i) => {
                  const vc = { BUY: "oklch(0.70 0.18 155)", WAIT: "oklch(0.80 0.14 80)", RENT: "oklch(0.68 0.18 25)" }[computed.verdictData.verdict];
                  return (
                    <div key={i} style={{ display: "flex", gap: "7px", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                      <span style={{ color: vc, flexShrink: 0, fontSize: "10px", marginTop: "1px" }}>{computed.verdictData.verdict === "RENT" ? "×" : "✓"}</span>
                      {r}
                    </div>
                  );
                })}
              </div>
              {/* AI deep analysis */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "10px" }}>
                  Want FINN to go deeper? AI analysis accounts for nuances these rules can't capture.
                </div>
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

            {/* ── Biggest Risk ── */}
            {(() => {
              const downPctNum = inputs.purchase_price > 0 ? (inputs.down_payment / inputs.purchase_price) * 100 : 0;
              const risk = calcBiggestRisk({
                affordabilityRatio: computed.affordabilityRatio,
                retirDelta: computed.retirDelta,
                breakEvenYear: computed.breakEvenYear,
                holdYears: inputs.hold_years,
                downPct: downPctNum,
                purchasePrice: inputs.purchase_price,
                stressTests: computed.stressTests,
              });
              const riskColor = risk.severity === "high" ? "oklch(0.68 0.18 25)" : "oklch(0.80 0.14 80)";
              const riskBg = risk.severity === "high"
                ? "color-mix(in oklch, oklch(0.68 0.18 25) 6%, var(--card-bg))"
                : "color-mix(in oklch, oklch(0.80 0.14 80) 5%, var(--card-bg))";
              const riskBorder = risk.severity === "high"
                ? "color-mix(in oklch, oklch(0.68 0.18 25) 22%, transparent)"
                : "color-mix(in oklch, oklch(0.80 0.14 80) 20%, transparent)";
              return (
                <div data-card style={{ ...cardS, background: riskBg, border: `1px solid ${riskBorder}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: riskColor, flexShrink: 0 }} />
                    <p style={{ ...sectionHead, margin: 0 }}>Biggest Risk</p>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "20px", background: `color-mix(in oklch, ${riskColor} 12%, transparent)`, color: riskColor, border: `1px solid color-mix(in oklch, ${riskColor} 25%, transparent)`, marginLeft: "auto", fontFamily: "var(--font-body)" }}>
                      {risk.severity === "high" ? "High" : "Medium"}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, color: riskColor, letterSpacing: "-0.3px", marginBottom: "8px" }}>
                    {risk.title}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                    {risk.body}
                  </p>
                </div>
              );
            })()}

          </div>
        </div>

        {/* ── Scenario Comparison Center ── */}
        {scenarioSummaries.length >= 2 && (() => {
          const cols = scenarioSummaries.slice(0, 4);
          const vColors = {
            BUY:  { text: "oklch(0.70 0.18 155)", bg: "color-mix(in oklch, oklch(0.70 0.18 155) 10%, transparent)", border: "color-mix(in oklch, oklch(0.70 0.18 155) 22%, transparent)" },
            WAIT: { text: "oklch(0.80 0.14 80)",  bg: "color-mix(in oklch, oklch(0.80 0.14 80)  10%, transparent)", border: "color-mix(in oklch, oklch(0.80 0.14 80)  20%, transparent)" },
            RENT: { text: "oklch(0.68 0.18 25)",  bg: "color-mix(in oklch, oklch(0.68 0.18 25)  10%, transparent)", border: "color-mix(in oklch, oklch(0.68 0.18 25)  20%, transparent)" },
          };
          // Find best per metric
          const minCost    = Math.min(...cols.map((c) => c.totalMonthly));
          const minBreak   = Math.min(...cols.map((c) => c.breakEvenYear ?? 9999));
          const maxRetir   = Math.max(...cols.map((c) => c.retirWithHomeAssets ?? -Infinity));
          const maxAff     = Math.max(...cols.map((c) => c.affordabilityScore?.score ?? -1));
          const hasCost    = cols.some((c) => c.totalMonthly > 0);
          const hasBreak   = cols.some((c) => c.breakEvenYear != null);
          const hasRetir   = cols.some((c) => c.retirWithHomeAssets != null);
          const hasAff     = cols.some((c) => c.affordabilityScore != null);

          const rowLabel = (text: string) => (
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-muted)", fontFamily: "var(--font-body)", padding: "9px 14px", whiteSpace: "nowrap" as const, borderBottom: "1px solid var(--border-subtle)" }}>
              {text}
            </div>
          );
          const cell = (content: React.ReactNode, isBest = false) => (
            <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" as const, background: isBest ? "color-mix(in oklch, oklch(0.80 0.14 80) 5%, transparent)" : "transparent" }}>
              {content}
            </div>
          );

          return (
            <div style={{ marginTop: "6px" }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <div style={{ height: "1px", width: "16px", background: "var(--border-subtle)" }} />
                <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>Scenario Comparison Center</span>
                <div style={{ height: "1px", flex: 1, background: "var(--border-subtle)" }} />
              </div>

              <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                  {/* Top-left empty */}
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }} />
                  {cols.map((s) => {
                    const vc = vColors[s.verdictData.verdict];
                    const isActive = s.id === activeScenarioId;
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)",
                          background: isActive ? "color-mix(in oklch, #3b82f6 8%, var(--bg-elevated))" : "var(--bg-elevated)",
                          textAlign: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => { const sc = scenarios.find((sc) => sc.id === s.id); if (sc) handleLoadScenario(sc); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, color: isActive ? "#60a5fa" : "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.2px", marginBottom: "4px" }}>{s.name}</div>
                          <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: "12px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-body)", background: vc.bg, color: vc.text, border: `1px solid ${vc.border}` }}>
                            {s.verdictData.verdict}
                          </span>
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px" }}>{s.verdictData.confidence} confidence</div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Price row */}
                <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                  {rowLabel("Purchase Price")}
                  {cols.map((s) => (
                    <div key={s.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", textAlign: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{fmtK(s.purchasePrice)}</span>
                    </div>
                  ))}
                </div>

                {/* Monthly cost row */}
                {hasCost && (
                  <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                    {rowLabel("Monthly Cost")}
                    {cols.map((s) => {
                      const isBest = s.totalMonthly === minCost;
                      return (
                        <div key={s.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", textAlign: "center", background: isBest ? "color-mix(in oklch, oklch(0.80 0.14 80) 5%, transparent)" : "transparent" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: isBest ? "oklch(0.80 0.14 80)" : "var(--text-secondary)" }}>{fmt(Math.round(s.totalMonthly))}/mo</span>
                          {isBest && <div style={{ fontSize: "8px", color: "oklch(0.80 0.14 80)", marginTop: "2px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Lowest</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Break-even row */}
                {hasBreak && (
                  <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                    {rowLabel("Break-Even Year")}
                    {cols.map((s) => {
                      const isBest = s.breakEvenYear != null && s.breakEvenYear === minBreak;
                      return (
                        <div key={s.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", textAlign: "center", background: isBest ? "color-mix(in oklch, #3b82f6 5%, transparent)" : "transparent" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: s.breakEvenYear == null ? "var(--text-muted)" : isBest ? "#60a5fa" : "var(--text-secondary)" }}>
                            {s.breakEvenYear != null ? `Yr ${s.breakEvenYear}` : "None"}
                          </span>
                          {isBest && <div style={{ fontSize: "8px", color: "#60a5fa", marginTop: "2px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Fastest</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Retirement assets row */}
                {hasRetir && (
                  <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                    {rowLabel("Retirement Assets")}
                    {cols.map((s) => {
                      const isBest = s.retirWithHomeAssets != null && s.retirWithHomeAssets === maxRetir;
                      return (
                        <div key={s.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", textAlign: "center", background: isBest ? "color-mix(in oklch, oklch(0.70 0.18 155) 5%, transparent)" : "transparent" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: s.retirWithHomeAssets == null ? "var(--text-muted)" : isBest ? "oklch(0.70 0.18 155)" : "var(--text-secondary)" }}>
                            {s.retirWithHomeAssets != null ? fmtK(s.retirWithHomeAssets) : "—"}
                          </span>
                          {isBest && s.retirWithHomeAssets != null && <div style={{ fontSize: "8px", color: "oklch(0.70 0.18 155)", marginTop: "2px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Highest</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Retirement probability delta */}
                {computed.retirBaselineProb != null && cols.some((c) => c.retirWithHomeProb != null) && (
                  <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                    {rowLabel("Retirement Impact")}
                    {cols.map((s) => {
                      const delta = s.retirWithHomeProb != null && s.retirBaselineProb != null
                        ? s.retirWithHomeProb - s.retirBaselineProb
                        : null;
                      const positive = delta != null && delta >= 0;
                      const neutral = delta != null && delta >= -3 && delta < 0;
                      return (
                        <div key={s.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: delta == null ? "var(--text-muted)" : positive ? "oklch(0.70 0.18 155)" : neutral ? "oklch(0.80 0.14 80)" : "oklch(0.68 0.18 25)" }}>
                            {delta != null ? `${delta >= 0 ? "+" : ""}${delta}pp` : "—"}
                          </span>
                          {delta != null && (
                            <div style={{ fontSize: "8px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {positive ? "Improves" : neutral ? "Neutral" : "Reduces"} probability
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Affordability score */}
                {hasAff && (
                  <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${cols.length}, 1fr)` }}>
                    {rowLabel("Affordability Score")}
                    {cols.map((s) => {
                      const aff = s.affordabilityScore;
                      const isBest = aff != null && aff.score === maxAff;
                      const scoreColor = !aff ? "var(--text-muted)"
                        : aff.score >= 90 ? "oklch(0.70 0.18 155)"
                        : aff.score >= 75 ? "#60a5fa"
                        : aff.score >= 60 ? "oklch(0.80 0.14 80)"
                        : "oklch(0.68 0.18 25)";
                      return (
                        <div key={s.id} style={{ padding: "9px 12px", borderBottom: "none", borderLeft: "1px solid var(--border-subtle)", textAlign: "center", background: isBest ? "color-mix(in oklch, oklch(0.70 0.18 155) 4%, transparent)" : "transparent" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: scoreColor }}>
                            {aff ? aff.score : "—"}
                          </span>
                          {aff && <div style={{ fontSize: "9px", color: scoreColor, marginTop: "2px", opacity: 0.8 }}>{aff.rating}</div>}
                          {isBest && aff && <div style={{ fontSize: "8px", color: scoreColor, marginTop: "2px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Best</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p style={{ fontSize: "9px", color: "var(--text-muted)", padding: "7px 14px 9px", borderTop: "1px solid var(--border-subtle)", margin: 0, lineHeight: 1.5 }}>
                  Highlighted cells indicate the best-performing scenario for each metric. Click a scenario name to load it.
                </p>
              </div>
            </div>
          );
        })()}

      </div>

      {/* Styles: hover glow, custom tooltips, modal */}
      <style>{`
        [data-card] {
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        [data-card]:hover {
          box-shadow: 0 0 0 1px rgba(59,130,246,0.14), 0 6px 28px rgba(59,130,246,0.07);
          border-color: rgba(59,130,246,0.18) !important;
        }
        .afford-row:not([style*="cursor: default"]):hover {
          background: color-mix(in oklch, #3b82f6 6%, var(--bg-elevated)) !important;
          border-color: rgba(59,130,246,0.22) !important;
        }
        .afford-row:not([style*="cursor: default"]):hover span:last-child {
          background: rgba(59,130,246,0.1) !important;
          color: #93c5fd !important;
          border-color: rgba(59,130,246,0.25) !important;
        }
        abbr[title] {
          text-decoration: underline dotted rgba(148,163,184,0.4);
          cursor: help;
        }
        /* Custom tooltip icon */
        .has-tip {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(59,130,246,0.10);
          border: 1px solid rgba(59,130,246,0.22);
          color: #60a5fa;
          font-size: 9px;
          font-weight: 800;
          font-style: italic;
          cursor: help;
          vertical-align: middle;
          margin-left: 5px;
          flex-shrink: 0;
          transition: background 0.15s, border-color 0.15s;
          font-family: Georgia, serif;
        }
        .has-tip:hover {
          background: rgba(59,130,246,0.20);
          border-color: rgba(59,130,246,0.45);
        }
        .has-tip::after {
          content: attr(data-tip);
          position: absolute;
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
          min-width: 230px;
          max-width: 280px;
          padding: 10px 13px;
          border-radius: 10px;
          background: #0d1f3c;
          border: 1px solid rgba(59,130,246,0.25);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          color: #94a3b8;
          font-size: 11.5px;
          line-height: 1.55;
          font-family: var(--font-body, sans-serif);
          font-weight: 400;
          font-style: normal;
          text-transform: none;
          letter-spacing: 0;
          z-index: 200;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.18s ease, visibility 0.18s ease;
          white-space: normal;
          text-align: left;
        }
        .has-tip:hover::after {
          opacity: 1;
          visibility: visible;
        }
        /* Amort modal */
        .amort-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2,8,18,0.92);
          backdrop-filter: blur(8px);
          z-index: 999;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 32px 16px 40px;
          overflow-y: auto;
        }
        .amort-modal {
          background: #060f1e;
          border: 1px solid rgba(59,130,246,0.18);
          border-radius: 18px;
          width: 100%;
          max-width: 980px;
          box-shadow: 0 32px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(59,130,246,0.06) inset;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .amort-modal-head {
          background: linear-gradient(160deg, #0a1628 0%, #060f1e 100%);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 18px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .amort-modal-body { overflow-y: auto; max-height: 58vh; }
        .amort-modal-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .amort-modal-table thead th {
          padding: 9px 12px 10px;
          text-align: right;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #334155;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: #060f1e;
          position: sticky;
          top: 0;
          z-index: 2;
          white-space: nowrap;
        }
        .amort-modal-table tbody tr {
          border-bottom: 1px solid rgba(255,255,255,0.03);
          transition: background 0.1s;
        }
        .amort-modal-table tbody tr:hover { background: rgba(59,130,246,0.07) !important; }
        .amort-modal-table tbody td {
          padding: 7px 12px;
          text-align: right;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: #64748b;
        }
        @media (max-width: 768px) {
          [data-home-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Full-screen amortization modal ── */}
      {showAmortModal && (
        <div className="amort-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAmortModal(false); }}>
          <div className="amort-modal">

            {/* Header */}
            <div className="amort-modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#60a5fa" strokeWidth="1.6"><path d="M3 3h14v14H3zM3 7h14M7 7v10M11 7v10" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#3b82f6", fontFamily: "var(--font-mono)", marginBottom: "2px" }}>Amortization Schedule</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", fontFamily: "var(--font-display)", letterSpacing: "-0.3px" }}>{inputs.name}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "28px", marginRight: "12px" }}>
                {[
                  { label: "Purchase Price", value: fmt(inputs.purchase_price) },
                  { label: "Rate / Term", value: `${inputs.mortgage_rate}% · ${inputs.loan_term_years} yr` },
                  { label: "Down Payment", value: fmt(inputs.down_payment) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "#94a3b8", marginTop: "1px" }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={exportAmortToCSV} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(59,130,246,0.28)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "background 0.15s" }}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14l6 5 6-5M10 2v17" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Export to Excel
                </button>
                <button onClick={() => setShowAmortModal(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748b", fontSize: "18px", cursor: "pointer", transition: "color 0.15s, background 0.15s" }}>
                  ×
                </button>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { label: "Monthly P&I", value: fmt(computed.amortStats.monthlyPayment), sub: "principal + interest", accent: "#e2e8f0" },
                { label: "Total Interest Cost", value: fmtK(computed.amortStats.totalInterest), sub: "over full loan term", accent: "oklch(0.68 0.18 25)" },
                { label: "More Going to You", value: computed.amortStats.crossoverYear != null ? `Year ${computed.amortStats.crossoverYear}` : "—", sub: "principal beats interest", accent: "#3b82f6" },
                { label: "Halfway Home", value: computed.amortStats.equity50Year != null ? `Year ${computed.amortStats.equity50Year}` : "—", sub: "loan half paid off", accent: "#00d395" },
              ].map(({ label, value, sub, accent }, i) => (
                <div key={label} style={{ padding: "14px 18px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                  <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#475569", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: "10px", color: "#334155", marginTop: "3px", fontFamily: "var(--font-body)" }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="amort-modal-body">
              <table className="amort-modal-table">
                <colgroup>
                  <col style={{ width: "56px" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "9%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingLeft: "20px" }}>Year</th>
                    <th>Loan Balance</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Total Interest</th>
                    <th>Home Value</th>
                    <th>Equity</th>
                    <th>Equity %</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.amortization.map((row, idx) => {
                    const isHoldYear = row.year === inputs.hold_years;
                    const isCrossover = row.isCrossover;
                    const isEven = idx % 2 === 0;
                    const rowBg = isHoldYear
                      ? "rgba(59,130,246,0.09)"
                      : isCrossover
                      ? "rgba(0,211,149,0.06)"
                      : isEven ? "rgba(255,255,255,0.01)" : "transparent";
                    return (
                      <tr key={row.year} style={{ background: rowBg, borderLeft: isHoldYear ? "3px solid #3b82f6" : isCrossover ? "3px solid rgba(0,211,149,0.4)" : "3px solid transparent" }}>
                        <td style={{ textAlign: "left", paddingLeft: "17px", color: isHoldYear ? "#60a5fa" : "#475569", fontWeight: isHoldYear ? 700 : 400 }}>
                          {row.year}{isHoldYear ? " ★" : ""}
                        </td>
                        <td style={{ color: "#64748b" }}>{row.balance < 100 ? <span style={{ color: "#1e3a5f" }}>Paid off</span> : fmtK(row.balance)}</td>
                        <td style={{ color: "#3b82f6" }}>{row.year === 0 ? <span style={{ color: "#1e3a5f" }}>—</span> : fmtK(row.annualPrincipal)}</td>
                        <td style={{ color: "oklch(0.68 0.16 25)" }}>{row.year === 0 ? <span style={{ color: "#1e3a5f" }}>—</span> : fmtK(row.annualInterest)}</td>
                        <td style={{ color: "#475569" }}>{fmtK(row.cumulativeInterest)}</td>
                        <td style={{ color: "#64748b" }}>{fmtK(row.homeValue)}</td>
                        <td style={{ color: "#00d395", fontWeight: 600 }}>{fmtK(row.equity)}</td>
                        <td>
                          <span style={{
                            display: "inline-block", padding: "1px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                            background: row.equityPct >= 50 ? "rgba(0,211,149,0.1)" : row.equityPct >= 20 ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.06)",
                            color: row.equityPct >= 50 ? "#00d395" : row.equityPct >= 20 ? "#60a5fa" : "#475569",
                          }}>
                            {row.year === 0 ? `${row.equityPct.toFixed(0)}%` : `${row.equityPct.toFixed(1)}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 20px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              {[
                { dot: "#3b82f6", text: "★ = your planned hold year" },
                { dot: "rgba(0,211,149,0.5)", text: "Green border = crossover (principal > interest)" },
                { dot: "#00d395", text: "Equity % turns green at 50%+" },
              ].map(({ dot, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", color: "#334155", fontFamily: "var(--font-body)" }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
