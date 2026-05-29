import { NextRequest, NextResponse } from "next/server";

// Census ACS 5-year estimates
// B25077_001E = Median home value (owner-occupied)
// B25064_001E = Median gross rent
// B19013_001E = Median household income
// B25103_001E = Median real estate taxes paid (annual $)
const CENSUS_VARS = "B25077_001E,B25064_001E,B19013_001E,B25103_001E";
const CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5";

// FRED series for 30-year fixed mortgage rate
const FRED_MORTGAGE_SERIES = "MORTGAGE30US";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// HUD Fair Market Rents by ZIP (2-bedroom used as rent proxy)
const HUD_FMR_BASE = "https://www.huduser.gov/hudapi/public/fmr/zip";

type CensusRow = [string, string, string, string, string];

async function fetchCensusData(zip: string): Promise<{
  medianHomeValue: number | null;
  medianRent: number | null;
  medianHouseholdIncome: number | null;
  annualPropertyTax: number | null;
}> {
  const apiKey = process.env.CENSUS_API_KEY;
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  // Census requires literal colon in geography param (not %3A), spaces as + or %20 both work.
  // Use + (form encoding) which Census examples show.
  const url = `${CENSUS_BASE}?get=${CENSUS_VARS}&for=zip+code+tabulation+area:${zip}${keyParam}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // 24h cache — ACS is annual
    if (!res.ok) return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null, annualPropertyTax: null };

    const body = await res.text();
    let rows: CensusRow[];
    try { rows = JSON.parse(body) as CensusRow[]; } catch { return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null, annualPropertyTax: null }; }
    if (!rows || rows.length < 2) return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null, annualPropertyTax: null };

    const [homeValueStr, rentStr, incomeStr, taxStr] = rows[1];
    const parse = (v: string) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };

    return {
      medianHomeValue: parse(homeValueStr),
      medianRent: parse(rentStr),
      medianHouseholdIncome: parse(incomeStr),
      annualPropertyTax: parse(taxStr),
    };
  } catch {
    return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null, annualPropertyTax: null };
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

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } }); // 1h cache
    if (!res.ok) return null;
    const data = await res.json() as { observations?: { date: string; value: string }[] };
    const obs = data.observations;
    if (!obs?.length) return null;
    const v = parseFloat(obs[0].value);
    return isNaN(v) ? null : +v.toFixed(2);
  } catch {
    return null;
  }
}

async function fetchHudFmr(zip: string): Promise<{ twoBed: number | null; countyName: string | null }> {
  const token = process.env.HUD_API_TOKEN;
  if (!token) return { twoBed: null, countyName: null };

  try {
    const res = await fetch(`${HUD_FMR_BASE}/${zip}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 * 7 }, // 1-week cache — HUD FMR updates annually
    });
    if (!res.ok) return { twoBed: null, countyName: null };

    const body = await res.json() as {
      data?: {
        basicdata?: {
          "Two-Bedroom"?: number;
          county_name?: string;
          town_name?: string;
        };
      };
    };
    const bd = body.data?.basicdata;
    if (!bd) return { twoBed: null, countyName: null };

    return {
      twoBed: bd["Two-Bedroom"] ?? null,
      countyName: bd.county_name ?? bd.town_name ?? null,
    };
  } catch {
    return { twoBed: null, countyName: null };
  }
}

function calcMortgagePayment(loan: number, annualRatePct: number, termYears: number): number {
  if (loan <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r <= 0) return loan / n;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export type HomeMarketData = {
  zip: string;
  medianHomeValue: number | null;
  medianRent: number | null;
  rentSource: "census" | "hud_fmr" | null;
  medianHouseholdIncome: number | null;
  mortgageRate: number | null;
  mortgageRateSource: "fred" | null;
  annualPropertyTax: number | null;
  monthlyPropertyTax: number | null;
  effectiveTaxRatePct: number | null;        // annual tax / home value * 100
  hudFmrTwoBed: number | null;               // raw HUD 2BR FMR for reference
  hudCountyName: string | null;
  priceToRentRatio: number | null;
  buyRentSignal: "strongly_buy" | "lean_buy" | "neutral" | "lean_rent" | "strongly_rent" | null;
  monthlyPIAtMedian: number | null;
  debtToIncomeAtMedian: number | null;
  downPayment20Pct: number | null;
  yearsToSave20Pct: number | null;
  censusAvailable: boolean;
  fredAvailable: boolean;
  hudAvailable: boolean;
  dataVintage: string;
  _debug: { censusKeyPresent: boolean; fredKeyPresent: boolean; censusRejected: boolean };
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
    : { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null, annualPropertyTax: null };
  const mortgageRate = rateResult.status === "fulfilled" ? rateResult.value : null;
  const hudData = hudResult.status === "fulfilled" ? hudResult.value : { twoBed: null, countyName: null };

  const { medianHomeValue, medianHouseholdIncome, annualPropertyTax } = censusData;

  // Rent: prefer Census median, fall back to HUD 2BR FMR
  const medianRent = censusData.medianRent ?? hudData.twoBed ?? null;
  const rentSource: HomeMarketData["rentSource"] = censusData.medianRent
    ? "census"
    : hudData.twoBed ? "hud_fmr" : null;

  // Property tax
  const monthlyPropertyTax = annualPropertyTax ? Math.round(annualPropertyTax / 12) : null;
  const effectiveTaxRatePct = annualPropertyTax && medianHomeValue && medianHomeValue > 0
    ? Math.round((annualPropertyTax / medianHomeValue) * 10000) / 100  // 2 decimal places
    : null;

  // Price-to-rent ratio
  let priceToRentRatio: number | null = null;
  let buyRentSignal: HomeMarketData["buyRentSignal"] = null;
  if (medianHomeValue && medianRent && medianRent > 0) {
    priceToRentRatio = Math.round((medianHomeValue / (medianRent * 12)) * 10) / 10;
    if (priceToRentRatio < 15)       buyRentSignal = "strongly_buy";
    else if (priceToRentRatio < 20)  buyRentSignal = "lean_buy";
    else if (priceToRentRatio < 25)  buyRentSignal = "neutral";
    else if (priceToRentRatio < 30)  buyRentSignal = "lean_rent";
    else                             buyRentSignal = "strongly_rent";
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
    censusAvailable: !!medianHomeValue,
    fredAvailable: !!mortgageRate,
    hudAvailable: !!hudData.twoBed,
    dataVintage: "2022 ACS 5-yr",
    _debug: {
      censusKeyPresent: !!process.env.CENSUS_API_KEY,
      fredKeyPresent: !!process.env.FRED_API_KEY,
      censusRejected: censusResult.status === "rejected",
    },
  };

  return NextResponse.json(result);
}
