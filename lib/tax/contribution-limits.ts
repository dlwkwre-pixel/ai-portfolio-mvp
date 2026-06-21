// Single source of truth for IRS contribution limits, keyed by tax year.
// There is no official IRS API for these, so we keep a verified table and auto-select
// the current year. When the IRS announces the next year's figures (usually each Nov),
// add one block below — every screen updates automatically.
//
// Sources (verified 2026-06-21):
//   2026: https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
//   2025: IRS Notice 2024-80

export type ContributionLimits = {
  year: number;
  ira: number;              // Traditional + Roth IRA, under 50
  iraCatchUp: number;       // additional, age 50+
  k401: number;             // 401(k)/403(b)/457/TSP elective deferral, under 50
  k401CatchUp: number;      // additional, age 50+
  k401SuperCatchUp: number; // additional, age 60-63 (replaces the 50+ catch-up)
  hsaSelf: number;
  hsaFamily: number;
  hsaCatchUp: number;       // age 55+
  simple: number;
  simpleCatchUp: number;    // age 50+
  rothPhaseOut: {           // Roth IRA contribution income phase-out (MAGI)
    single: [number, number];
    married_filing_jointly: [number, number];
  };
};

const LIMITS: Record<number, ContributionLimits> = {
  2025: {
    year: 2025,
    ira: 7_000, iraCatchUp: 1_000,
    k401: 23_500, k401CatchUp: 7_500, k401SuperCatchUp: 11_250,
    hsaSelf: 4_300, hsaFamily: 8_550, hsaCatchUp: 1_000,
    simple: 16_500, simpleCatchUp: 3_500,
    rothPhaseOut: { single: [150_000, 165_000], married_filing_jointly: [236_000, 246_000] },
  },
  2026: {
    year: 2026,
    ira: 7_500, iraCatchUp: 1_100,
    k401: 24_500, k401CatchUp: 8_000, k401SuperCatchUp: 11_250,
    hsaSelf: 4_400, hsaFamily: 8_750, hsaCatchUp: 1_000,
    simple: 17_000, simpleCatchUp: 4_000,
    rothPhaseOut: { single: [153_000, 168_000], married_filing_jointly: [242_000, 252_000] },
  },
};

// Returns the limits for the given year, falling back to the most recent table we have
// that is not in the future (so a new calendar year before the IRS announcement still
// shows the latest known figures rather than breaking).
export function contributionLimits(year: number = new Date().getFullYear()): ContributionLimits {
  if (LIMITS[year]) return LIMITS[year];
  const known = Object.keys(LIMITS).map(Number).sort((a, b) => b - a);
  const best = known.find((y) => y <= year) ?? known[0];
  return LIMITS[best];
}

// Convenience: IRA limit including the age-50+ catch-up.
export function iraLimitForAge(age: number | null | undefined, year?: number): number {
  const l = contributionLimits(year);
  return l.ira + ((age ?? 0) >= 50 ? l.iraCatchUp : 0);
}
