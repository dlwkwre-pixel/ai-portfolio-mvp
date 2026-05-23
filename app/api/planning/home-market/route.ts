import { NextRequest, NextResponse } from "next/server";

// Census ACS 5-year estimates — variables
// B25077_001E = Median home value
// B25064_001E = Median gross rent
// B19013_001E = Median household income
const CENSUS_VARS = "B25077_001E,B25064_001E,B19013_001E";
const CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5";

// FRED series for 30-year fixed mortgage rate
const FRED_MORTGAGE_SERIES = "MORTGAGE30US";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

type CensusRow = [string, string, string, string]; // [homeValue, rent, income, zipCode]

async function fetchCensusData(zip: string): Promise<{ medianHomeValue: number | null; medianRent: number | null; medianHouseholdIncome: number | null }> {
  // Build URL as a string — URLSearchParams encodes the colon in "zip code tabulation area:XXXXX"
  // as %3A, which Census API rejects. The colon must stay literal.
  const apiKey = process.env.CENSUS_API_KEY;
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  const censusUrl = `${CENSUS_BASE}?get=${CENSUS_VARS}&for=zip%20code%20tabulation%20area:${zip}${keyParam}`;

  const res = await fetch(censusUrl, { next: { revalidate: 86400 } }); // 24h cache — ACS data is annual
  if (!res.ok) return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null };

  const rows = await res.json() as CensusRow[];
  if (!rows || rows.length < 2) return { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null };

  const [homeValueStr, rentStr, incomeStr] = rows[1];
  const parse = (v: string) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };

  return {
    medianHomeValue: parse(homeValueStr),
    medianRent: parse(rentStr),
    medianHouseholdIncome: parse(incomeStr),
  };
}

async function fetchMortgageRate(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", FRED_MORTGAGE_SERIES);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "1");
  url.searchParams.set("observation_start", "2020-01-01");

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } }); // 1h cache
  if (!res.ok) return null;
  const data = await res.json() as { observations?: { value: string }[] };
  const obs = data.observations;
  if (!obs?.length) return null;
  const v = parseFloat(obs[0].value);
  return isNaN(v) ? null : v;
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
  medianHouseholdIncome: number | null;
  mortgageRate: number | null;
  // Derived
  priceToRentRatio: number | null;
  buyRentSignal: "strongly_buy" | "lean_buy" | "neutral" | "lean_rent" | "strongly_rent" | null;
  monthlyPIAtMedian: number | null;         // P&I at 20% down, current rate, 30yr
  debtToIncomeAtMedian: number | null;      // monthly P&I / (medianIncome / 12)
  downPayment20Pct: number | null;          // 20% down on median home
  yearsToSave20Pct: number | null;          // years to save 20% at 20% savings rate of median income
  censusAvailable: boolean;
  fredAvailable: boolean;
};

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip")?.trim() ?? "";
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Invalid ZIP code. Must be 5 digits." }, { status: 400 });
  }

  const [census, mortgageRate] = await Promise.allSettled([
    fetchCensusData(zip),
    fetchMortgageRate(),
  ]);

  const censusData = census.status === "fulfilled" ? census.value : { medianHomeValue: null, medianRent: null, medianHouseholdIncome: null };
  const rate = mortgageRate.status === "fulfilled" ? mortgageRate.value : null;

  const { medianHomeValue, medianRent, medianHouseholdIncome } = censusData;

  // Price-to-rent ratio
  let priceToRentRatio: number | null = null;
  let buyRentSignal: HomeMarketData["buyRentSignal"] = null;
  if (medianHomeValue && medianRent && medianRent > 0) {
    priceToRentRatio = Math.round((medianHomeValue / (medianRent * 12)) * 10) / 10;
    if (priceToRentRatio < 15) buyRentSignal = "strongly_buy";
    else if (priceToRentRatio < 20) buyRentSignal = "lean_buy";
    else if (priceToRentRatio < 25) buyRentSignal = "neutral";
    else if (priceToRentRatio < 30) buyRentSignal = "lean_rent";
    else buyRentSignal = "strongly_rent";
  }

  // Monthly P&I at median home value with 20% down
  const effectiveRate = rate ?? 6.75;
  let monthlyPIAtMedian: number | null = null;
  let debtToIncomeAtMedian: number | null = null;
  let downPayment20Pct: number | null = null;
  let yearsToSave20Pct: number | null = null;

  if (medianHomeValue) {
    downPayment20Pct = Math.round(medianHomeValue * 0.2);
    const loan = medianHomeValue * 0.8;
    monthlyPIAtMedian = Math.round(calcMortgagePayment(loan, effectiveRate, 30));

    if (medianHouseholdIncome && medianHouseholdIncome > 0) {
      debtToIncomeAtMedian = Math.round((monthlyPIAtMedian / (medianHouseholdIncome / 12)) * 1000) / 10; // as %
      // Years to save 20% down at 20% savings rate of median income
      const annualSavings = medianHouseholdIncome * 0.2;
      if (annualSavings > 0) {
        yearsToSave20Pct = Math.round((downPayment20Pct / annualSavings) * 10) / 10;
      }
    }
  }

  const result: HomeMarketData = {
    zip,
    medianHomeValue,
    medianRent,
    medianHouseholdIncome,
    mortgageRate: rate,
    priceToRentRatio,
    buyRentSignal,
    monthlyPIAtMedian,
    debtToIncomeAtMedian,
    downPayment20Pct,
    yearsToSave20Pct,
    censusAvailable: !!medianHomeValue,
    fredAvailable: !!rate,
  };

  return NextResponse.json(result);
}
