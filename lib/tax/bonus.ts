// Take-home from an annual bonus. Employers withhold bonuses as supplemental wages: a flat
// 22% federal rate, Social Security + Medicare (7.65%) on the full amount, plus state tax.
// A Traditional 401(k) contribution comes out before income tax (not before FICA); a Roth
// one comes out after. This is the paycheck view — the real tax bill settles at filing.

export const SUPPLEMENTAL_FEDERAL_RATE = 0.22;
const FICA_RATE = 0.0765;

export function bonusTakeHome(args: {
  grossBonus: number;
  k401Pct: number;          // 15 = 15%
  includes401k: boolean;
  isRoth: boolean;
  stateRate: number;        // effective state rate as a fraction (TX = 0)
}): { gross: number; k401: number; taxes: number; takeHome: number } {
  const gross = Math.max(0, args.grossBonus);
  const k401 = args.includes401k ? gross * Math.max(0, args.k401Pct) / 100 : 0;
  const incomeTaxBase = args.isRoth ? gross : gross - k401;
  const taxes = incomeTaxBase * (SUPPLEMENTAL_FEDERAL_RATE + Math.max(0, args.stateRate)) + gross * FICA_RATE;
  return { gross, k401, taxes, takeHome: gross - k401 - taxes };
}
