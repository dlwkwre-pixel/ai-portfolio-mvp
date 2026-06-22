// 401(k) contribution + employer-match modeling for the planning and tax pages.
// Planning estimates only, not tax advice.
//
// Answers the questions a 401(k) participant actually has:
//   - How much goes in if I defer X%? What does my employer add?
//   - Am I capturing the full match (free money) or leaving some behind?
//   - Will I hit the IRS annual limit?
//   - What happens to my take-home pay at 3% vs 5% vs 15%?
//   - Traditional (pre-tax) vs Roth — how does the tax picture differ?

import { contributionLimits } from "./contribution-limits";
import { estimateTax, type FilingStatus, type IncomeType } from "./estimator";

export type K401Input = {
  grossAnnualIncome: number;
  contributionPct: number;        // employee elective deferral, % of gross
  isRoth: boolean;
  employerMatchPct: number;       // match rate: 100 = $1 per $1, 50 = $0.50 per $1
  employerMatchLimitPct: number;  // employer matches up to this % of salary
  age: number | null;
  year?: number;
};

export type K401Result = {
  employeeAnnual: number;         // actual employee contribution after IRS cap
  employeeRequested: number;      // pre-cap, what the % implies
  employerAnnual: number;         // employer match dollars
  totalAnnual: number;            // employee + employer
  traditionalAnnual: number;      // pre-tax portion (employee, 0 if Roth)
  irsEmployeeLimit: number;       // elective-deferral cap incl. age catch-ups
  combinedLimit: number;          // 415(c) total-additions cap
  cappedByIrs: boolean;           // the % would exceed the employee deferral limit
  cappedByCombined: boolean;      // employee + employer hit the 415(c) ceiling
  fullMatchPct: number;           // deferral % needed to capture the entire match
  capturesFullMatch: boolean;
  unmatchedFreeMoney: number;     // employer $ forfeited by deferring below fullMatchPct
};

// 415(c) combined employee + employer limit by year (codebase contribution table
// covers elective deferrals; the combined ceiling is tracked here).
const COMBINED_LIMIT: Record<number, number> = { 2025: 70_000, 2026: 72_000 };
function combinedLimitForYear(year: number): number {
  if (COMBINED_LIMIT[year]) return COMBINED_LIMIT[year];
  const known = Object.keys(COMBINED_LIMIT).map(Number).sort((a, b) => b - a);
  return COMBINED_LIMIT[known.find((y) => y <= year) ?? known[0]];
}

// Employee elective-deferral limit including age catch-ups (SECURE 2.0 super
// catch-up for ages 60-63 replaces the standard 50+ catch-up).
export function employeeDeferralLimit(age: number | null | undefined, year?: number): number {
  const l = contributionLimits(year);
  const a = age ?? 0;
  if (a >= 60 && a <= 63) return l.k401 + l.k401SuperCatchUp;
  if (a >= 50) return l.k401 + l.k401CatchUp;
  return l.k401;
}

export function compute401k(input: K401Input): K401Result {
  const year = input.year ?? new Date().getFullYear();
  const gross = Math.max(0, input.grossAnnualIncome);
  const pct = Math.max(0, input.contributionPct);
  const matchRate = Math.max(0, input.employerMatchPct) / 100;
  const matchLimitPct = Math.max(0, input.employerMatchLimitPct);

  const irsEmployeeLimit = employeeDeferralLimit(input.age, year);
  const combinedLimit = combinedLimitForYear(year);

  const employeeRequested = gross * (pct / 100);
  const employeeAnnual = Math.min(employeeRequested, irsEmployeeLimit);
  const cappedByIrs = employeeRequested > irsEmployeeLimit + 0.5;

  // Employer matches the lesser of (what you deferred) and (the match-limit % of salary),
  // at the match rate. Match is based on the actual deferral %, capped at the limit %.
  const matchedPct = Math.min(pct, matchLimitPct);
  let employerAnnual = gross * (matchedPct / 100) * matchRate;

  // 415(c) combined ceiling caps employee + employer together.
  let cappedByCombined = false;
  if (employeeAnnual + employerAnnual > combinedLimit) {
    employerAnnual = Math.max(0, combinedLimit - employeeAnnual);
    cappedByCombined = true;
  }

  const fullMatchPct = matchLimitPct;
  const capturesFullMatch = matchLimitPct === 0 || pct >= matchLimitPct - 1e-9;
  // Free money left behind: the additional employer match you'd get by deferring up to the limit.
  const potentialMatch = gross * (matchLimitPct / 100) * matchRate;
  const unmatchedFreeMoney = Math.max(0, potentialMatch - employerAnnual);

  const traditionalAnnual = input.isRoth ? 0 : employeeAnnual;

  return {
    employeeAnnual,
    employeeRequested,
    employerAnnual,
    totalAnnual: employeeAnnual + employerAnnual,
    traditionalAnnual,
    irsEmployeeLimit,
    combinedLimit,
    cappedByIrs,
    cappedByCombined,
    fullMatchPct,
    capturesFullMatch,
    unmatchedFreeMoney,
  };
}

export type K401Scenario = {
  pct: number;
  employeeAnnual: number;
  employerAnnual: number;
  totalSavedAnnual: number;       // employee + employer into the account
  takeHomeAnnual: number;         // cash in pocket after tax AND the deferral
  takeHomeMonthly: number;
  totalTax: number;
  taxSavedVsZero: number;         // income tax saved relative to deferring 0% (Traditional only)
  capturesFullMatch: boolean;
  cappedByIrs: boolean;
};

// Compute take-home + savings across a set of contribution percentages so the user can
// compare "what if I do 3% / 5% / 15%". Take-home = net pay after tax, minus the deferral
// (the money that leaves the paycheck into the 401k). Employer match is on top, not take-home.
export function compare401kScenarios(
  base: {
    grossAnnualIncome: number;
    filing: FilingStatus;
    incomeType: IncomeType;
    stateCode: string;
    basePreTaxDeductionsAnnual: number; // other pre-tax deductions (HSA, etc.), excludes 401k
    isRoth: boolean;
    employerMatchPct: number;
    employerMatchLimitPct: number;
    age: number | null;
    year?: number;
  },
  percents: number[],
): K401Scenario[] {
  const grossMonthly = base.grossAnnualIncome / 12;

  // Baseline tax with 0% deferral for the "tax saved" comparison.
  const zeroTax = estimateTax(
    grossMonthly, base.filing, base.incomeType, base.stateCode,
    Math.max(0, base.basePreTaxDeductionsAnnual),
  ).totalTax;

  return percents.map((pct) => {
    const k = compute401k({
      grossAnnualIncome: base.grossAnnualIncome,
      contributionPct: pct,
      isRoth: base.isRoth,
      employerMatchPct: base.employerMatchPct,
      employerMatchLimitPct: base.employerMatchLimitPct,
      age: base.age,
      year: base.year,
    });

    const preTax = Math.max(0, base.basePreTaxDeductionsAnnual) + k.traditionalAnnual;
    const tax = estimateTax(grossMonthly, base.filing, base.incomeType, base.stateCode, preTax);
    const takeHomeAnnual = Math.max(0, tax.netAnnual - k.employeeAnnual);

    return {
      pct,
      employeeAnnual: k.employeeAnnual,
      employerAnnual: k.employerAnnual,
      totalSavedAnnual: k.totalAnnual,
      takeHomeAnnual,
      takeHomeMonthly: takeHomeAnnual / 12,
      totalTax: tax.totalTax,
      taxSavedVsZero: Math.max(0, zeroTax - tax.totalTax),
      capturesFullMatch: k.capturesFullMatch,
      cappedByIrs: k.cappedByIrs,
    };
  });
}

// Default comparison ladder, always including the user's current % and the full-match %.
export function defaultScenarioPercents(currentPct: number, fullMatchPct: number): number[] {
  const set = new Set<number>([0, 3, 5, 10, 15]);
  if (fullMatchPct > 0) set.add(Math.round(fullMatchPct));
  if (currentPct > 0) set.add(Math.round(currentPct * 10) / 10);
  return [...set].filter((p) => p >= 0 && p <= 100).sort((a, b) => a - b);
}
