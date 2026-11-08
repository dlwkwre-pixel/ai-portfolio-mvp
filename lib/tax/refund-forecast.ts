// Federal refund (or amount owed) forecast for the current tax year, built from the latest
// paystub's year-to-date numbers. Paystub YTD is the truth so far; the rest of the year is
// projected paycheck by paycheck, with withholding modeled the way payroll does it (IRS
// percentage method: annualize the check, apply the brackets after the standard deduction)
// and calibrated to what this paystub actually withheld, so W-4 extras or credits carry
// forward. Planning estimate only — credits (child tax credit etc.) are not modeled.

import { applyBrackets, federalBrackets, longTermCapGainsTax, standardDeduction, type FilingStatus } from "./estimator";
import { SUPPLEMENTAL_FEDERAL_RATE } from "./bonus";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export const PAY_PERIODS: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

export type PaystubInputs = {
  payDate: string;            // YYYY-MM-DD of the paystub
  frequency: PayFrequency;
  ytdGross: number;
  ytdFedWithheld: number;     // federal income tax only (not Social Security / Medicare)
  ytdPreTax: number;          // 401(k) + health/dental/vision + HSA/FSA, year to date
  checkGross?: number | null;        // "this period" column — sharpens the projection
  checkFedWithheld?: number | null;
  checkPreTax?: number | null;
  futureGross?: number | null;       // gross per check for the rest of the year (defaults to salary)
  interest?: number | null;          // bank interest for the full year
  overtimePremium?: number | null;   // the "half" of time-and-a-half, full year
  bonusOnStub?: boolean;             // the bonus is already in these YTD numbers
};

export type RefundForecast = {
  wages: number;              // W-2 box 1: gross minus pre-tax deductions
  otherIncome: number;        // interest + net capital gains + dividends (after the $3k loss limit)
  deductions: number;         // standard + overtime
  taxableIncome: number;
  liability: number;
  withheldSoFar: number;
  withheldAhead: number;      // remaining paychecks + bonus
  refund: number;             // positive = refund, negative = owe
  checksLeft: number;
  perCheck: { gross: number; preTax: number; withheld: number };
  bonus: { gross: number; withheld: number } | null;
  checksSoFar: number;
};

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const lastDay = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0, 12)).getUTCDate();
// A nominal pay date that falls on a weekend gets paid a day or two early — treat anything within
// 3 days of the paystub as that paystub.
const GRACE = 3 * DAY;

function nominalDates(frequency: PayFrequency, payDate: string, year: number): string[] {
  const out: string[] = [];
  if (frequency === "semimonthly" || frequency === "monthly") {
    for (let m = 0; m < 12; m++) {
      if (frequency === "semimonthly") out.push(iso(new Date(Date.UTC(year, m, 15, 12))));
      out.push(iso(new Date(Date.UTC(year, m, lastDay(year, m), 12))));
    }
    return out;
  }
  const step = (frequency === "weekly" ? 7 : 14) * DAY;
  const anchor = toDate(payDate).getTime();
  const start = Date.UTC(year, 0, 1, 12), end = Date.UTC(year, 11, 31, 12);
  let t = anchor;
  while (t - step >= start) t -= step;
  for (; t <= end; t += step) out.push(iso(new Date(t)));
  return out;
}

export function payDateSplit(payDate: string, frequency: PayFrequency): { soFar: number; ahead: string[] } {
  const year = Number(payDate.slice(0, 4));
  const stub = toDate(payDate).getTime();
  const dates = nominalDates(frequency, payDate, year);
  const ahead = dates.filter((d) => toDate(d).getTime() - stub > GRACE);
  return { soFar: Math.max(1, dates.length - ahead.length), ahead };
}

// Federal withholding on one regular check, IRS percentage method (2020+ W-4, no Step 2 box).
export function withholdingPerCheck(gross: number, preTax: number, filing: FilingStatus, periods: number): number {
  const annualTaxable = Math.max(0, (gross - preTax) * periods - standardDeduction(filing));
  return applyBrackets(annualTaxable, federalBrackets(filing)).tax / periods;
}

export function forecastRefund(args: {
  filing: FilingStatus;
  stub: PaystubInputs;
  salaryAnnual: number;          // current salary; sets the default gross per check
  k401Pct: number;               // Traditional (pre-tax) 401(k) % of pay; 0 for Roth
  bonus: { gross: number; month: number; includes401k: boolean } | null;  // this year's bonus, if any
  investments: { shortTerm: number; longTerm: number; dividends: number };
}): RefundForecast {
  const { filing, stub } = args;
  const periods = PAY_PERIODS[stub.frequency];
  const { soFar, ahead } = payDateSplit(stub.payDate, stub.frequency);
  const k401 = Math.max(0, args.k401Pct) / 100;

  // What a typical check looks like now, from "this period" if given, else the YTD average.
  const curGross = stub.checkGross ?? stub.ytdGross / soFar;
  const curPreTax = stub.checkPreTax ?? stub.ytdPreTax / soFar;
  const flatPreTax = Math.max(0, curPreTax - k401 * curGross);   // insurance etc. doesn't scale with pay
  // Payroll's withholding vs. the formula on that check: W-4 extras/credits, carried forward.
  const offset = stub.checkFedWithheld != null && stub.checkGross != null
    ? stub.checkFedWithheld - withholdingPerCheck(curGross, curPreTax, filing, periods)
    : stub.ytdFedWithheld / soFar - withholdingPerCheck(curGross, curPreTax, filing, periods);

  const gross = Math.max(0, stub.futureGross ?? (args.salaryAnnual > 0 ? args.salaryAnnual / periods : curGross));
  const preTax = Math.min(gross, k401 * gross + flatPreTax);
  const withheld = Math.max(0, withholdingPerCheck(gross, preTax, filing, periods) + offset);
  const n = ahead.length;

  // Bonus still to come this year: supplemental wages, flat 22% federal.
  const stubMonth = Number(stub.payDate.slice(5, 7));
  const bonusAhead = args.bonus && args.bonus.gross > 0
    && (stubMonth < args.bonus.month || (stubMonth === args.bonus.month && !stub.bonusOnStub));
  const bonusGross = bonusAhead ? args.bonus!.gross : 0;
  const bonusPreTax = bonusAhead && args.bonus!.includes401k ? k401 * bonusGross : 0;
  const bonusWithheld = (bonusGross - bonusPreTax) * SUPPLEMENTAL_FEDERAL_RATE;

  const wages = Math.max(0, stub.ytdGross - stub.ytdPreTax) + n * (gross - preTax) + (bonusGross - bonusPreTax);

  // Capital gains netting: short and long offset each other; a net loss deducts up to $3,000.
  let st = args.investments.shortTerm, lt = args.investments.longTerm;
  const net = st + lt;
  let lossDeduction = 0;
  if (net <= 0) { lossDeduction = Math.min(filing === "married_filing_separately" ? 1_500 : 3_000, -net); st = 0; lt = 0; }
  else if (st < 0) { lt = net; st = 0; }
  else if (lt < 0) { st = net; lt = 0; }
  const interest = Math.max(0, stub.interest ?? 0);
  const dividends = Math.max(0, args.investments.dividends);   // treated as qualified
  const ordinary = wages + interest + st - lossDeduction;
  const preferential = lt + dividends;
  const agi = ordinary + preferential;

  // Overtime premium deduction (2025–2028): $12,500 / $25,000 MFJ, shrinking $100 per $1,000 over $150k / $300k.
  const mfj = filing === "married_filing_jointly";
  const otCap = Math.max(0, (mfj ? 25_000 : 12_500) - Math.floor(Math.max(0, agi - (mfj ? 300_000 : 150_000)) / 1_000) * 100);
  const overtime = filing === "married_filing_separately" ? 0 : Math.min(Math.max(0, stub.overtimePremium ?? 0), otCap);

  const deductions = standardDeduction(filing) + overtime;
  const taxableIncome = Math.max(0, agi - deductions);
  const ordinaryTaxable = Math.max(0, ordinary - deductions);
  const prefTaxable = taxableIncome - ordinaryTaxable;
  const niitThreshold = mfj ? 250_000 : filing === "married_filing_separately" ? 125_000 : 200_000;
  const niit = 0.038 * Math.max(0, Math.min(interest + Math.max(0, st) + preferential, agi - niitThreshold));
  const liability = applyBrackets(ordinaryTaxable, federalBrackets(filing)).tax
    + longTermCapGainsTax(prefTaxable, ordinaryTaxable, filing) + niit;

  const withheldAhead = n * withheld + bonusWithheld;
  return {
    wages,
    otherIncome: interest + st + preferential - lossDeduction,
    deductions,
    taxableIncome,
    liability,
    withheldSoFar: stub.ytdFedWithheld,
    withheldAhead,
    refund: stub.ytdFedWithheld + withheldAhead - liability,
    checksLeft: n,
    perCheck: { gross, preTax, withheld },
    bonus: bonusAhead ? { gross: bonusGross, withheld: bonusWithheld } : null,
    checksSoFar: soFar,
  };
}
