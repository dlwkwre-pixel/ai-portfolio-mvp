import { NextRequest, NextResponse } from "next/server";

// Census ACS 5-year estimates — ZCTA-available variables only
const CENSUS_VAR_LIST = [
  "B25077_001E",  // Median home value (owner-occupied)
  "B25064_001E",  // Median gross rent
  "B19013_001E",  // Median household income
  "B25003_001E",  // Total occupied housing units (for ownership rate)
  "B25003_002E",  // Owner-occupied units
  "B25071_001E",  // Median gross rent as % of household income (rent burden)
  "B25002_001E",  // Total housing units (for vacancy rate)
  "B25002_002E",  // Vacant housing units
  "B25088_001E",  // Median selected monthly owner costs — with mortgage (note: includes utilities)
  "B25034_001E",  // Year structure built: total
  "B25034_002E",  // Built 2020+
  "B25034_003E",  // Built 2010–2019
  "B25034_004E",  // Built 2000–2009
  "B25034_005E",  // Built 1990–1999
  "B25034_006E",  // Built 1980–1989
  "B25034_007E",  // Built 1970–1979
  "B25034_008E",  // Built 1960–1969
  "B25034_009E",  // Built 1950–1959
  "B25034_010E",  // Built 1940–1949
  "B25034_011E",  // Built 1939 or earlier
];
const CENSUS_VARS = CENSUS_VAR_LIST.join(",");
const CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5";

const FRED_MORTGAGE_SERIES = "MORTGAGE30US";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

const HUD_FMR_BASE = "https://www.huduser.gov/hudapi/public/fmr/zip";

type CensusRow = string[];

type CensusResult = {
  medianHomeValue: number | null;
  medianRent: number | null;
  medianHouseholdIncome: number | null;
  totalOccupied: number | null;
  ownerOccupied: number | null;
  rentBurdenPct: number | null;
  totalHousingUnits: number | null;
  vacantUnits: number | null;
  medianOwnerCosts: number | null;
  yearBuiltTotal: number | null;
  yearBuilt2020plus: number | null;
  yearBuilt2010_2019: number | null;
  yearBuilt2000_2009: number | null;
  yearBuilt1990_1999: number | null;
  yearBuilt1980_1989: number | null;
  yearBuilt1970_1979: number | null;
  yearBuilt1960_1969: number | null;
  yearBuilt1950_1959: number | null;
  yearBuilt1940_1949: number | null;
  yearBuilt1939earlier: number | null;
  keyRequired: boolean;
  lastError: string | null;
};

// Census returns -666666666 (N/A) or -999999999 (insufficient data) — treat as null
function parseCensusNum(v: string): number | null {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0) return null;
  return n;
}

function parseCensusFloat(v: string): number | null {
  const n = parseFloat(v);
  if (isNaN(n) || n < 0) return null;
  return n;
}

async function fetchCensusData(zip: string): Promise<CensusResult> {
  const apiKey = process.env.CENSUS_API_KEY?.trim();
  const nullResult = (keyRequired = false, lastError: string | null = null): CensusResult => ({
    medianHomeValue: null, medianRent: null, medianHouseholdIncome: null,
    totalOccupied: null, ownerOccupied: null, rentBurdenPct: null,
    totalHousingUnits: null, vacantUnits: null, medianOwnerCosts: null,
    yearBuiltTotal: null, yearBuilt2020plus: null, yearBuilt2010_2019: null,
    yearBuilt2000_2009: null, yearBuilt1990_1999: null, yearBuilt1980_1989: null,
    yearBuilt1970_1979: null, yearBuilt1960_1969: null, yearBuilt1950_1959: null,
    yearBuilt1940_1949: null, yearBuilt1939earlier: null,
    keyRequired, lastError,
  });

  if (!apiKey) return nullResult(true, "CENSUS_API_KEY not set");

  const urls = [
    `${CENSUS_BASE}?get=${CENSUS_VARS}&for=zip%20code%20tabulation%20area:${zip}&key=${encodeURIComponent(apiKey)}`,
    `${CENSUS_BASE}?get=${CENSUS_VARS}&for=zcta5:${zip}&key=${encodeURIComponent(apiKey)}`,
  ];

  let lastError: string | null = null;

  async function tryCensus(url: string): Promise<CensusRow[] | null> {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text().catch(() => "");
    if (!res.ok || body.trimStart().startsWith("<")) {
      lastError = `HTTP ${res.status}: ${body.slice(0, 120).replace(/\s+/g, " ")}`;
      console.error(`[census] ZIP ${zip} ${lastError}`);
      return null;
    }
    try { return JSON.parse(body) as CensusRow[]; } catch (e) {
      lastError = `JSON parse failed: ${body.slice(0, 120)}`;
      console.error(`[census] JSON parse error ZIP ${zip}:`, e);
      return null;
    }
  }

  try {
    for (const url of urls) {
      const rows = await tryCensus(url);
      if (rows && rows.length >= 2) {
        const r = rows[1]; // data row
        return {
          medianHomeValue:     parseCensusNum(r[0]),
          medianRent:          parseCensusNum(r[1]),
          medianHouseholdIncome: parseCensusNum(r[2]),
          totalOccupied:       parseCensusNum(r[3]),
          ownerOccupied:       parseCensusNum(r[4]),
          rentBurdenPct:       parseCensusFloat(r[5]),
          totalHousingUnits:   parseCensusNum(r[6]),
          vacantUnits:         parseCensusNum(r[7]),
          medianOwnerCosts:    parseCensusNum(r[8]),
          yearBuiltTotal:      parseCensusNum(r[9]),
          yearBuilt2020plus:   parseCensusNum(r[10]),
          yearBuilt2010_2019:  parseCensusNum(r[11]),
          yearBuilt2000_2009:  parseCensusNum(r[12]),
          yearBuilt1990_1999:  parseCensusNum(r[13]),
          yearBuilt1980_1989:  parseCensusNum(r[14]),
          yearBuilt1970_1979:  parseCensusNum(r[15]),
          yearBuilt1960_1969:  parseCensusNum(r[16]),
          yearBuilt1950_1959:  parseCensusNum(r[17]),
          yearBuilt1940_1949:  parseCensusNum(r[18]),
          yearBuilt1939earlier: parseCensusNum(r[19]),
          keyRequired: false,
          lastError: null,
        };
      }
    }
    return nullResult(false, lastError ?? "No ZCTA data found for this ZIP");
  } catch (e) {
    return nullResult(false, String(e));
  }
}

async function fetchMortgageRate(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL(FRED_BASE);
    url.searchParams.set("series_id", FRED_MORTGAGE_SERIES);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "1");
    url.searchParams.set("observation_start", "2020-01-01");
    const res = await fetch(url.toString(), { next: { revalidate: 14400 } });
    if (!res.ok) return null;
    const data = await res.json() as { observations?: { date: string; value: string }[] };
    const obs = data.observations;
    if (!obs?.length) return null;
    const v = parseFloat(obs[0].value);
    return isNaN(v) ? null : +v.toFixed(2);
  } catch { return null; }
}

async function fetchHudFmr(zip: string): Promise<{ twoBed: number | null; countyName: string | null }> {
  const token = process.env.HUD_API_TOKEN;
  if (!token) return { twoBed: null, countyName: null };
  try {
    const res = await fetch(`${HUD_FMR_BASE}/${zip}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 * 7 },
    });
    if (!res.ok) return { twoBed: null, countyName: null };
    const body = await res.json() as {
      data?: { basicdata?: { "Two-Bedroom"?: number; county_name?: string; town_name?: string } };
    };
    const bd = body.data?.basicdata;
    if (!bd) return { twoBed: null, countyName: null };
    return { twoBed: bd["Two-Bedroom"] ?? null, countyName: bd.county_name ?? bd.town_name ?? null };
  } catch { return { twoBed: null, countyName: null }; }
}

function calcMortgagePayment(loan: number, annualRatePct: number, termYears: number): number {
  if (loan <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r <= 0) return loan / n;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Weighted-average year built from ACS B25034 distribution buckets
function calcMedianYearBuilt(c: CensusResult): number | null {
  const total = c.yearBuiltTotal;
  if (!total || total <= 0) return null;
  const buckets = [
    { mid: 2022, n: c.yearBuilt2020plus ?? 0 },
    { mid: 2015, n: c.yearBuilt2010_2019 ?? 0 },
    { mid: 2005, n: c.yearBuilt2000_2009 ?? 0 },
    { mid: 1995, n: c.yearBuilt1990_1999 ?? 0 },
    { mid: 1985, n: c.yearBuilt1980_1989 ?? 0 },
    { mid: 1975, n: c.yearBuilt1970_1979 ?? 0 },
    { mid: 1965, n: c.yearBuilt1960_1969 ?? 0 },
    { mid: 1955, n: c.yearBuilt1950_1959 ?? 0 },
    { mid: 1945, n: c.yearBuilt1940_1949 ?? 0 },
    { mid: 1930, n: c.yearBuilt1939earlier ?? 0 },
  ];
  const countSum = buckets.reduce((s, b) => s + b.n, 0);
  if (countSum <= 0) return null;
  return Math.round(buckets.reduce((s, b) => s + b.mid * b.n, 0) / countSum);
}

function suggestMaintenancePct(medianYearBuilt: number | null): number | null {
  if (medianYearBuilt === null) return null;
  if (medianYearBuilt < 1960) return 2.0;
  if (medianYearBuilt < 1980) return 1.75;
  if (medianYearBuilt < 2000) return 1.5;
  if (medianYearBuilt < 2010) return 1.25;
  return 1.0;
}

type MarketFactor = { label: string; positive: boolean };

function calcMarketScore(
  vacancyRate: number | null,
  rentBurdenPct: number | null,
  homeownershipRate: number | null,
  priceToIncome: number | null,
  medianYearBuilt: number | null,
): { score: number; label: string; factors: MarketFactor[] } {
  let score = 0;
  const factors: MarketFactor[] = [];

  // Vacancy rate (25 pts) — low vacancy = tight supply = favors ownership
  if (vacancyRate !== null) {
    if (vacancyRate < 2.5) { score += 25; factors.push({ label: "Very tight housing supply", positive: true }); }
    else if (vacancyRate < 4.5) { score += 20; factors.push({ label: "Low vacancy rate", positive: true }); }
    else if (vacancyRate < 7.0) { score += 12; }
    else if (vacancyRate < 12.0) { score += 5; factors.push({ label: "Elevated vacancy", positive: false }); }
    else { factors.push({ label: "High vacancy — soft housing market", positive: false }); }
  } else { score += 12; }

  // Rent burden (25 pts) — high burden = renting is expensive = ownership more attractive
  if (rentBurdenPct !== null) {
    if (rentBurdenPct > 40) { score += 25; factors.push({ label: "High rent burden — strong ownership case", positive: true }); }
    else if (rentBurdenPct > 33) { score += 20; factors.push({ label: "Above-average rent burden", positive: true }); }
    else if (rentBurdenPct > 26) { score += 12; }
    else if (rentBurdenPct > 18) { score += 5; factors.push({ label: "Renting is relatively affordable here", positive: false }); }
    else { factors.push({ label: "Low rent burden — renting is cheap here", positive: false }); }
  } else { score += 12; }

  // Homeownership rate (25 pts) — higher = established owner community
  if (homeownershipRate !== null) {
    if (homeownershipRate > 72) { score += 25; factors.push({ label: "High homeownership community", positive: true }); }
    else if (homeownershipRate > 62) { score += 20; factors.push({ label: "Strong owner-occupant rate", positive: true }); }
    else if (homeownershipRate > 50) { score += 12; }
    else if (homeownershipRate > 38) { score += 5; factors.push({ label: "Predominantly rental area", positive: false }); }
    else { factors.push({ label: "Renter-dominated market", positive: false }); }
  } else { score += 12; }

  // Price-to-income ratio (25 pts) — lower = more accessible
  if (priceToIncome !== null) {
    if (priceToIncome < 3.5) { score += 25; factors.push({ label: "Very accessible home prices", positive: true }); }
    else if (priceToIncome < 5.5) { score += 20; factors.push({ label: "Affordable price-to-income ratio", positive: true }); }
    else if (priceToIncome < 8.0) { score += 12; }
    else if (priceToIncome < 12.0) { score += 5; factors.push({ label: "Stretched prices vs. local income", positive: false }); }
    else { factors.push({ label: "Very high price-to-income ratio", positive: false }); }
  } else { score += 12; }

  // Housing age bonus factor (not scored — qualitative only)
  if (medianYearBuilt !== null) {
    if (medianYearBuilt >= 2000) factors.push({ label: "Newer housing stock", positive: true });
    else if (medianYearBuilt < 1975) factors.push({ label: "Older housing stock — higher maintenance likely", positive: false });
  }

  const label = score >= 80 ? "Strong Buy Market"
    : score >= 65 ? "Favorable Market"
    : score >= 50 ? "Balanced Market"
    : score >= 35 ? "Lean Renter Market"
    : "Strong Renter Market";

  return { score: Math.min(100, score), label, factors };
}

export type HomeMarketData = {
  zip: string;
  // Core housing metrics
  medianHomeValue: number | null;
  medianRent: number | null;
  rentSource: "census" | "hud_fmr" | null;
  medianHouseholdIncome: number | null;
  mortgageRate: number | null;
  mortgageRateSource: "fred" | null;
  annualPropertyTax: number | null;
  monthlyPropertyTax: number | null;
  effectiveTaxRatePct: number | null;
  hudFmrTwoBed: number | null;
  hudCountyName: string | null;
  // Buy vs. rent signals
  priceToRentRatio: number | null;
  buyRentSignal: "strongly_buy" | "lean_buy" | "neutral" | "lean_rent" | "strongly_rent" | null;
  monthlyPIAtMedian: number | null;
  debtToIncomeAtMedian: number | null;
  downPayment20Pct: number | null;
  yearsToSave20Pct: number | null;
  // Market intelligence (NEW)
  homeownershipRate: number | null;        // % owner-occupied of occupied units
  vacancyRate: number | null;              // % vacant of total housing units
  rentBurdenPct: number | null;            // median rent as % of household income
  medianOwnerCosts: number | null;         // monthly owner costs with mortgage (includes utilities)
  medianYearBuilt: number | null;          // weighted avg year built
  suggestedMaintenancePct: number | null;  // 1.0–2.0 based on housing age
  marketScore: number | null;              // 0–100 composite market score
  marketScoreLabel: string | null;         // "Strong Buy Market" etc.
  marketFactors: MarketFactor[];           // strengths and concerns
  // Availability flags
  censusAvailable: boolean;
  fredAvailable: boolean;
  hudAvailable: boolean;
  dataVintage: string;
  _debug: {
    censusKeyPresent: boolean;
    fredKeyPresent: boolean;
    censusRejected: boolean;
    censusKeyRequired: boolean;
    censusLastError: string | null;
  };
};

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip")?.trim() ?? "";
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Invalid ZIP code. Must be 5 digits." }, { status: 400 });
  }

  const [censusResult, rateResult, hudResult] = await Promise.allSettled([
    fetchCensusData(zip),
    fetchMortgageRate(),
    fetchHudFmr(zip),
  ]);

  const censusData = censusResult.status === "fulfilled"
    ? censusResult.value
    : { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null,
        totalOccupied: null, ownerOccupied: null, rentBurdenPct: null,
        totalHousingUnits: null, vacantUnits: null, medianOwnerCosts: null,
        yearBuiltTotal: null, yearBuilt2020plus: null, yearBuilt2010_2019: null,
        yearBuilt2000_2009: null, yearBuilt1990_1999: null, yearBuilt1980_1989: null,
        yearBuilt1970_1979: null, yearBuilt1960_1969: null, yearBuilt1950_1959: null,
        yearBuilt1940_1949: null, yearBuilt1939earlier: null,
        keyRequired: false, lastError: "fetch rejected" };

  const mortgageRate = rateResult.status === "fulfilled" ? rateResult.value : null;
  const hudData = hudResult.status === "fulfilled" ? hudResult.value : { twoBed: null, countyName: null };

  const { medianHomeValue, medianHouseholdIncome } = censusData;

  // Rent: prefer Census, fall back to HUD 2BR FMR
  const medianRent = censusData.medianRent ?? hudData.twoBed ?? null;
  const rentSource: HomeMarketData["rentSource"] = censusData.medianRent ? "census" : hudData.twoBed ? "hud_fmr" : null;

  // Property tax: estimated from national 1.1% effective rate — user-adjustable
  const annualPropertyTax = medianHomeValue ? Math.round(medianHomeValue * 0.011) : null;
  const monthlyPropertyTax = annualPropertyTax ? Math.round(annualPropertyTax / 12) : null;
  const effectiveTaxRatePct = 1.1;

  // Price-to-rent ratio and buy/rent signal
  let priceToRentRatio: number | null = null;
  let buyRentSignal: HomeMarketData["buyRentSignal"] = null;
  if (medianHomeValue && medianRent && medianRent > 0) {
    priceToRentRatio = Math.round((medianHomeValue / (medianRent * 12)) * 10) / 10;
    if (priceToRentRatio < 15)      buyRentSignal = "strongly_buy";
    else if (priceToRentRatio < 20) buyRentSignal = "lean_buy";
    else if (priceToRentRatio < 25) buyRentSignal = "neutral";
    else if (priceToRentRatio < 30) buyRentSignal = "lean_rent";
    else                            buyRentSignal = "strongly_rent";
  }

  // Monthly P&I at median with 20% down, 30yr
  const effectiveRate = mortgageRate ?? 6.75;
  let monthlyPIAtMedian: number | null = null;
  let debtToIncomeAtMedian: number | null = null;
  let downPayment20Pct: number | null = null;
  let yearsToSave20Pct: number | null = null;

  if (medianHomeValue) {
    downPayment20Pct = Math.round(medianHomeValue * 0.2);
    const loan = medianHomeValue * 0.8;
    monthlyPIAtMedian = Math.round(calcMortgagePayment(loan, effectiveRate, 30));
    if (medianHouseholdIncome && medianHouseholdIncome > 0) {
      debtToIncomeAtMedian = Math.round((monthlyPIAtMedian / (medianHouseholdIncome / 12)) * 1000) / 10;
      const annualSavings = medianHouseholdIncome * 0.2;
      if (annualSavings > 0) yearsToSave20Pct = Math.round((downPayment20Pct / annualSavings) * 10) / 10;
    }
  }

  // Market intelligence — derived from Census data
  const homeownershipRate = censusData.totalOccupied && censusData.totalOccupied > 0 && censusData.ownerOccupied !== null
    ? Math.round((censusData.ownerOccupied / censusData.totalOccupied) * 1000) / 10
    : null;

  const vacancyRate = censusData.totalHousingUnits && censusData.totalHousingUnits > 0 && censusData.vacantUnits !== null
    ? Math.round((censusData.vacantUnits / censusData.totalHousingUnits) * 1000) / 10
    : null;

  const rentBurdenPct = censusData.rentBurdenPct; // already a % from Census

  const medianOwnerCosts = censusData.medianOwnerCosts;

  const medianYearBuilt = calcMedianYearBuilt(censusData);
  const suggestedMaintenancePct = suggestMaintenancePct(medianYearBuilt);

  const priceToIncome = medianHomeValue && medianHouseholdIncome && medianHouseholdIncome > 0
    ? Math.round((medianHomeValue / medianHouseholdIncome) * 10) / 10
    : null;

  const { score: marketScore, label: marketScoreLabel, factors: marketFactors } = calcMarketScore(
    vacancyRate,
    rentBurdenPct,
    homeownershipRate,
    priceToIncome,
    medianYearBuilt,
  );

  const result: HomeMarketData = {
    zip,
    medianHomeValue,
    medianRent,
    rentSource,
    medianHouseholdIncome,
    mortgageRate,
    mortgageRateSource: mortgageRate ? "fred" : null,
    annualPropertyTax,
    monthlyPropertyTax,
    effectiveTaxRatePct,
    hudFmrTwoBed: hudData.twoBed,
    hudCountyName: hudData.countyName,
    priceToRentRatio,
    buyRentSignal,
    monthlyPIAtMedian,
    debtToIncomeAtMedian,
    downPayment20Pct,
    yearsToSave20Pct,
    homeownershipRate,
    vacancyRate,
    rentBurdenPct,
    medianOwnerCosts,
    medianYearBuilt,
    suggestedMaintenancePct,
    marketScore: censusData.medianHomeValue ? marketScore : null,
    marketScoreLabel: censusData.medianHomeValue ? marketScoreLabel : null,
    marketFactors: censusData.medianHomeValue ? marketFactors : [],
    censusAvailable: !!medianHomeValue,
    fredAvailable: !!mortgageRate,
    hudAvailable: !!hudData.twoBed,
    dataVintage: "2022 ACS 5-yr",
    _debug: {
      censusKeyPresent: !!process.env.CENSUS_API_KEY?.trim(),
      fredKeyPresent: !!process.env.FRED_API_KEY,
      censusRejected: censusResult.status === "rejected",
      censusKeyRequired: censusData.keyRequired,
      censusLastError: censusData.lastError,
    },
  };

  return NextResponse.json(result);
}
