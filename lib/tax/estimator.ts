// US tax estimation — planning estimates only, not tax advice
// All values are 2025 approximations

export type FilingStatus = "single" | "married_filing_jointly" | "head_of_household" | "married_filing_separately";
export type IncomeType = "w2" | "self_employed" | "mixed";

export interface TaxBreakdown {
  grossAnnual: number;
  preTaxDeductionsAnnual: number;
  federalIncomeTax: number;
  federalEffectiveRate: number;
  federalMarginalRate: number;
  ficaTax: number;        // W-2 employee share (SS + Medicare)
  seTax: number;          // Self-employment tax (SE only)
  stateTax: number;
  stateEffectiveRate: number;
  totalTax: number;
  netAnnual: number;
  netMonthly: number;
  estimatedAGI: number;
}

// ── 2025 Federal Income Tax Brackets ─────────────────────────────────────────

const STD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_000,
  married_filing_jointly: 30_000,
  head_of_household: 22_500,
  married_filing_separately: 15_000,
};

type Bracket = { upTo: number; rate: number };

const FEDERAL_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.10 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married_filing_jointly: [
    { upTo: 23_850, rate: 0.10 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 17_000, rate: 0.10 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married_filing_separately: [
    { upTo: 11_925, rate: 0.10 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 375_800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

function applyBrackets(taxableIncome: number, brackets: Bracket[]): { tax: number; marginalRate: number } {
  if (taxableIncome <= 0) return { tax: 0, marginalRate: brackets[0].rate };
  let tax = 0;
  let prev = 0;
  let marginalRate = brackets[0].rate;
  for (const b of brackets) {
    const slice = Math.min(taxableIncome, b.upTo) - prev;
    if (slice <= 0) break;
    tax += slice * b.rate;
    marginalRate = b.rate;
    prev = b.upTo;
    if (taxableIncome <= b.upTo) break;
  }
  return { tax, marginalRate };
}

// ── FICA & SE Tax ─────────────────────────────────────────────────────────────

const SS_WAGE_BASE = 176_100; // 2025
const SS_RATE_EMPLOYEE = 0.062;
const MEDICARE_RATE_EMPLOYEE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009; // on wages over $200k single / $250k MFJ
const SE_RATE = 0.1530; // 15.3% on first SS_WAGE_BASE of 92.35% of net SE
const SE_MEDICARE_ONLY = 0.029; // above SS_WAGE_BASE

function computeFICA(grossAnnual: number, filing: FilingStatus): number {
  const ssCap = Math.min(grossAnnual, SS_WAGE_BASE);
  const ss = ssCap * SS_RATE_EMPLOYEE;
  const medicare = grossAnnual * MEDICARE_RATE_EMPLOYEE;
  const threshold = filing === "married_filing_jointly" ? 250_000 : 200_000;
  const additionalMedicare = Math.max(0, grossAnnual - threshold) * ADDITIONAL_MEDICARE_RATE;
  return ss + medicare + additionalMedicare;
}

function computeSETax(grossAnnual: number): { seTax: number; seDeduction: number } {
  const netSE = grossAnnual * 0.9235;
  const seCap = Math.min(netSE, SS_WAGE_BASE);
  const seTotal = seCap * SE_RATE + Math.max(0, netSE - SS_WAGE_BASE) * SE_MEDICARE_ONLY;
  const seDeduction = seTotal / 2;
  return { seTax: seTotal, seDeduction };
}

// ── State Income Tax ──────────────────────────────────────────────────────────
// Simplified 2025 rates for planning estimates. Uses single-filer brackets;
// MFJ thresholds are doubled unless stated. Effective rates within ±1-2pp for typical incomes.

type StateEntry =
  | { kind: "none" }
  | { kind: "flat"; rate: number }
  | { kind: "graduated"; single: Bracket[]; mfjFactor?: number };

const STATES: Record<string, StateEntry> = {
  // No income tax
  AK: { kind: "none" }, FL: { kind: "none" }, NV: { kind: "none" },
  NH: { kind: "none" }, SD: { kind: "none" }, TN: { kind: "none" },
  TX: { kind: "none" }, WA: { kind: "none" }, WY: { kind: "none" },

  // Flat rate
  AZ: { kind: "flat", rate: 0.025 },
  CO: { kind: "flat", rate: 0.044 },
  GA: { kind: "flat", rate: 0.0549 },
  IL: { kind: "flat", rate: 0.0495 },
  IN: { kind: "flat", rate: 0.0305 },
  KY: { kind: "flat", rate: 0.040 },
  MA: { kind: "flat", rate: 0.050 },
  MI: { kind: "flat", rate: 0.0405 },
  NC: { kind: "flat", rate: 0.045 },
  PA: { kind: "flat", rate: 0.0307 },
  UT: { kind: "flat", rate: 0.0455 },

  // Graduated — major states with real brackets
  CA: {
    kind: "graduated",
    single: [
      { upTo: 10_756, rate: 0.01 }, { upTo: 25_499, rate: 0.02 },
      { upTo: 40_244, rate: 0.04 }, { upTo: 55_866, rate: 0.06 },
      { upTo: 70_606, rate: 0.08 }, { upTo: 360_659, rate: 0.093 },
      { upTo: 432_787, rate: 0.103 }, { upTo: 721_314, rate: 0.113 },
      { upTo: Infinity, rate: 0.123 },
    ],
  },
  NY: {
    kind: "graduated",
    single: [
      { upTo: 17_150, rate: 0.04 }, { upTo: 23_600, rate: 0.045 },
      { upTo: 27_900, rate: 0.0525 }, { upTo: 161_550, rate: 0.055 },
      { upTo: 323_200, rate: 0.06 }, { upTo: 2_155_350, rate: 0.0685 },
      { upTo: Infinity, rate: 0.0965 },
    ],
  },
  NJ: {
    kind: "graduated",
    single: [
      { upTo: 20_000, rate: 0.014 }, { upTo: 35_000, rate: 0.0175 },
      { upTo: 40_000, rate: 0.035 }, { upTo: 75_000, rate: 0.05525 },
      { upTo: 500_000, rate: 0.0637 }, { upTo: 1_000_000, rate: 0.0897 },
      { upTo: Infinity, rate: 0.1075 },
    ],
  },
  OR: {
    kind: "graduated",
    single: [
      { upTo: 18_400, rate: 0.0475 }, { upTo: 46_200, rate: 0.0675 },
      { upTo: 250_000, rate: 0.0875 }, { upTo: Infinity, rate: 0.099 },
    ],
  },
  MN: {
    kind: "graduated",
    single: [
      { upTo: 31_690, rate: 0.0535 }, { upTo: 104_090, rate: 0.068 },
      { upTo: 193_240, rate: 0.0785 }, { upTo: Infinity, rate: 0.0985 },
    ],
  },
  WI: {
    kind: "graduated",
    single: [
      { upTo: 14_320, rate: 0.035 }, { upTo: 28_640, rate: 0.044 },
      { upTo: 315_310, rate: 0.053 }, { upTo: Infinity, rate: 0.0765 },
    ],
  },
  MD: {
    kind: "graduated",
    single: [
      { upTo: 1_000, rate: 0.02 }, { upTo: 2_000, rate: 0.03 },
      { upTo: 3_000, rate: 0.04 }, { upTo: 100_000, rate: 0.0475 },
      { upTo: 125_000, rate: 0.05 }, { upTo: 150_000, rate: 0.0525 },
      { upTo: 250_000, rate: 0.055 }, { upTo: Infinity, rate: 0.0575 },
    ],
  },
  VA: {
    kind: "graduated",
    single: [
      { upTo: 3_000, rate: 0.02 }, { upTo: 5_000, rate: 0.03 },
      { upTo: 17_000, rate: 0.05 }, { upTo: Infinity, rate: 0.0575 },
    ],
  },
  CT: {
    kind: "graduated",
    single: [
      { upTo: 10_000, rate: 0.03 }, { upTo: 50_000, rate: 0.05 },
      { upTo: 100_000, rate: 0.055 }, { upTo: 200_000, rate: 0.06 },
      { upTo: 250_000, rate: 0.065 }, { upTo: 500_000, rate: 0.069 },
      { upTo: Infinity, rate: 0.0699 },
    ],
  },
  VT: {
    kind: "graduated",
    single: [
      { upTo: 45_400, rate: 0.0335 }, { upTo: 110_050, rate: 0.066 },
      { upTo: 229_550, rate: 0.076 }, { upTo: Infinity, rate: 0.0875 },
    ],
  },
  HI: {
    kind: "graduated",
    single: [
      { upTo: 2_400, rate: 0.014 }, { upTo: 4_800, rate: 0.032 },
      { upTo: 9_600, rate: 0.055 }, { upTo: 14_400, rate: 0.064 },
      { upTo: 19_200, rate: 0.068 }, { upTo: 24_000, rate: 0.072 },
      { upTo: 36_000, rate: 0.076 }, { upTo: 48_000, rate: 0.079 },
      { upTo: 150_000, rate: 0.0825 }, { upTo: 175_000, rate: 0.09 },
      { upTo: 200_000, rate: 0.10 }, { upTo: Infinity, rate: 0.11 },
    ],
  },
  MO: {
    kind: "graduated",
    single: [
      { upTo: 1_207, rate: 0.015 }, { upTo: 2_414, rate: 0.02 },
      { upTo: 3_621, rate: 0.025 }, { upTo: 4_828, rate: 0.03 },
      { upTo: 6_035, rate: 0.035 }, { upTo: 7_242, rate: 0.04 },
      { upTo: 8_449, rate: 0.045 }, { upTo: 9_656, rate: 0.05 },
      { upTo: Infinity, rate: 0.048 },
    ],
  },
  IA: {
    kind: "graduated",
    single: [
      { upTo: 6_210, rate: 0.044 }, { upTo: 31_050, rate: 0.044 },
      { upTo: Infinity, rate: 0.06 },
    ],
  },
  ID: {
    kind: "graduated",
    single: [
      { upTo: 1_862, rate: 0.01 }, { upTo: 3_723, rate: 0.03 },
      { upTo: 5_585, rate: 0.045 }, { upTo: 7_447, rate: 0.055 },
      { upTo: Infinity, rate: 0.058 },
    ],
  },
  MT: {
    kind: "graduated",
    single: [
      { upTo: 3_600, rate: 0.01 }, { upTo: 6_300, rate: 0.02 },
      { upTo: 9_700, rate: 0.03 }, { upTo: 13_000, rate: 0.04 },
      { upTo: 16_800, rate: 0.05 }, { upTo: 21_600, rate: 0.06 },
      { upTo: Infinity, rate: 0.069 },
    ],
  },
  NE: {
    kind: "graduated",
    single: [
      { upTo: 3_700, rate: 0.0246 }, { upTo: 22_170, rate: 0.0351 },
      { upTo: 35_730, rate: 0.0501 }, { upTo: Infinity, rate: 0.0584 },
    ],
  },
  NM: {
    kind: "graduated",
    single: [
      { upTo: 5_500, rate: 0.017 }, { upTo: 11_000, rate: 0.032 },
      { upTo: 16_000, rate: 0.047 }, { upTo: 210_000, rate: 0.049 },
      { upTo: Infinity, rate: 0.059 },
    ],
  },
  OH: {
    kind: "graduated",
    single: [
      { upTo: 26_050, rate: 0 }, { upTo: 92_150, rate: 0.02765 },
      { upTo: Infinity, rate: 0.03500 },
    ],
  },
  OK: {
    kind: "graduated",
    single: [
      { upTo: 1_000, rate: 0.005 }, { upTo: 2_500, rate: 0.01 },
      { upTo: 3_750, rate: 0.02 }, { upTo: 4_900, rate: 0.03 },
      { upTo: 7_200, rate: 0.04 }, { upTo: Infinity, rate: 0.0475 },
    ],
  },
  RI: {
    kind: "graduated",
    single: [
      { upTo: 77_450, rate: 0.0375 }, { upTo: 176_050, rate: 0.0475 },
      { upTo: Infinity, rate: 0.0599 },
    ],
  },
  SC: { kind: "flat", rate: 0.064 },
  DE: {
    kind: "graduated",
    single: [
      { upTo: 2_000, rate: 0 }, { upTo: 5_000, rate: 0.022 },
      { upTo: 10_000, rate: 0.039 }, { upTo: 20_000, rate: 0.048 },
      { upTo: 25_000, rate: 0.052 }, { upTo: 60_000, rate: 0.0555 },
      { upTo: Infinity, rate: 0.066 },
    ],
  },
  ME: {
    kind: "graduated",
    single: [
      { upTo: 26_050, rate: 0.058 }, { upTo: 61_600, rate: 0.0675 },
      { upTo: Infinity, rate: 0.0715 },
    ],
  },
  MS: {
    kind: "graduated",
    single: [
      { upTo: 10_000, rate: 0 }, { upTo: Infinity, rate: 0.047 },
    ],
  },
  AL: {
    kind: "graduated",
    single: [
      { upTo: 500, rate: 0.02 }, { upTo: 3_000, rate: 0.04 },
      { upTo: Infinity, rate: 0.05 },
    ],
  },
  AR: {
    kind: "graduated",
    single: [
      { upTo: 4_300, rate: 0.02 }, { upTo: 8_500, rate: 0.04 },
      { upTo: Infinity, rate: 0.039 },
    ],
  },
  KS: {
    kind: "graduated",
    single: [
      { upTo: 15_000, rate: 0.031 }, { upTo: 30_000, rate: 0.0525 },
      { upTo: Infinity, rate: 0.057 },
    ],
  },
  LA: {
    kind: "graduated",
    single: [
      { upTo: 12_500, rate: 0.0185 }, { upTo: 50_000, rate: 0.035 },
      { upTo: Infinity, rate: 0.0425 },
    ],
  },
  ND: {
    kind: "graduated",
    single: [
      { upTo: 44_725, rate: 0.0195 }, { upTo: 225_975, rate: 0.0295 },
      { upTo: Infinity, rate: 0.0250 },
    ],
  },
  WV: {
    kind: "graduated",
    single: [
      { upTo: 10_000, rate: 0.03 }, { upTo: 25_000, rate: 0.04 },
      { upTo: 40_000, rate: 0.045 }, { upTo: 60_000, rate: 0.06 },
      { upTo: Infinity, rate: 0.065 },
    ],
  },
  DC: {
    kind: "graduated",
    single: [
      { upTo: 10_000, rate: 0.04 }, { upTo: 40_000, rate: 0.06 },
      { upTo: 60_000, rate: 0.065 }, { upTo: 350_000, rate: 0.085 },
      { upTo: 1_000_000, rate: 0.0925 }, { upTo: Infinity, rate: 0.1075 },
    ],
  },
};

function computeStateTax(
  grossAnnual: number,
  stateCode: string,
  filing: FilingStatus,
): number {
  const entry = STATES[stateCode.toUpperCase()];
  if (!entry || entry.kind === "none") return 0;
  if (entry.kind === "flat") return grossAnnual * entry.rate;

  // Graduated: scale thresholds for MFJ
  const factor = filing === "married_filing_jointly" ? (entry.mfjFactor ?? 2) : 1;
  const scaledBrackets: Bracket[] = entry.single.map((b) => ({
    upTo: b.upTo === Infinity ? Infinity : b.upTo * factor,
    rate: b.rate,
  }));
  return applyBrackets(grossAnnual, scaledBrackets).tax;
}

// ── Main Estimator ────────────────────────────────────────────────────────────

export function estimateTax(
  grossMonthly: number,
  filing: FilingStatus,
  incomeType: IncomeType,
  stateCode: string,
  preTaxDeductionsAnnual: number = 0,
): TaxBreakdown {
  const grossAnnual = grossMonthly * 12;
  const stdDeduction = STD_DEDUCTION[filing];

  let estimatedAGI = grossAnnual;
  let seTax = 0;
  let ficaTax = 0;

  if (incomeType === "self_employed" || incomeType === "mixed") {
    const seResult = computeSETax(grossAnnual);
    seTax = seResult.seTax;
    estimatedAGI = grossAnnual - seResult.seDeduction;
  }

  if (incomeType === "w2" || incomeType === "mixed") {
    ficaTax = computeFICA(grossAnnual, filing);
    if (incomeType === "mixed") {
      ficaTax = ficaTax / 2;
      seTax = seTax / 2;
    }
  }

  // Pre-tax deductions (401k, HSA, IRA, etc.) reduce AGI before applying income tax brackets.
  // FICA is still owed on full wages — these deductions don't reduce payroll tax.
  estimatedAGI = Math.max(0, estimatedAGI - Math.max(0, preTaxDeductionsAnnual));

  const taxableIncome = Math.max(0, estimatedAGI - stdDeduction);
  const brackets = FEDERAL_BRACKETS[filing];
  const { tax: federalIncomeTax, marginalRate: federalMarginalRate } = applyBrackets(taxableIncome, brackets);
  const federalEffectiveRate = grossAnnual > 0 ? federalIncomeTax / grossAnnual : 0;

  const stateTax = computeStateTax(grossAnnual, stateCode, filing);
  const stateEffectiveRate = grossAnnual > 0 ? stateTax / grossAnnual : 0;

  const totalTax = federalIncomeTax + ficaTax + seTax + stateTax;
  const netAnnual = grossAnnual - totalTax;
  const netMonthly = netAnnual / 12;

  return {
    grossAnnual,
    preTaxDeductionsAnnual: Math.max(0, preTaxDeductionsAnnual),
    federalIncomeTax,
    federalEffectiveRate,
    federalMarginalRate,
    ficaTax,
    seTax,
    stateTax,
    stateEffectiveRate,
    totalTax,
    netAnnual,
    netMonthly,
    estimatedAGI,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: "Single",
  married_filing_jointly: "Married Filing Jointly",
  head_of_household: "Head of Household",
  married_filing_separately: "Married Filing Separately",
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  w2: "W-2 Employee",
  self_employed: "Self-Employed / 1099",
  mixed: "W-2 + Freelance",
};

export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "Washington D.C." }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];
