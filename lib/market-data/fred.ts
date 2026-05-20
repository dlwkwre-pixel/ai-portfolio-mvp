// FRED (Federal Reserve Economic Data) API client
// Free API — register at fred.stlouisfed.org/docs/api/api_key.html
// Set FRED_API_KEY in .env.local and Vercel environment variables

const FRED_BASE = "https://api.stlouisfed.org/fred";

function getApiKey(): string | null {
  return process.env.FRED_API_KEY ?? null;
}

type FredObservation = {
  date: string;
  value: string;
};

type FredSeriesResponse = {
  observations: FredObservation[];
};

// Fetch the latest N observations for a FRED series
async function fetchFredSeries(seriesId: string, count = 3): Promise<FredObservation[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(count));
  // Exclude missing/future values
  url.searchParams.set("observation_start", "2020-01-01");

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 14400 }, // 4-hour cache
    });
    if (!res.ok) return [];
    const data: FredSeriesResponse = await res.json();
    return (data.observations ?? []).filter((o) => o.value !== "." && o.value !== "");
  } catch {
    return [];
  }
}

function latestValue(obs: FredObservation[]): number | null {
  if (!obs.length) return null;
  const v = parseFloat(obs[0].value);
  return isNaN(v) ? null : v;
}

function previousValue(obs: FredObservation[]): number | null {
  if (obs.length < 2) return null;
  const v = parseFloat(obs[1].value);
  return isNaN(v) ? null : v;
}

export type MacroSignals = {
  // Yield curve
  yieldCurveSpread: number | null;    // T10Y2Y: 10Y minus 2Y (positive = normal, negative = inverted)
  yield10y: number | null;            // DGS10: 10-year treasury yield %
  fedFundsRate: number | null;        // FEDFUNDS: current fed funds rate %
  fedFundsPrev: number | null;        // Previous period (trend detection)
  // Inflation & employment
  cpi: number | null;                 // CPIAUCSL YoY % change (computed)
  cpiPrev: number | null;
  unemployment: number | null;        // UNRATE: current unemployment %
  unemploymentPrev: number | null;
  // Credit
  creditSpread: number | null;        // BAMLH0A0HYM2: high-yield OAS basis points
  // Availability
  fredAvailable: boolean;
};

export async function getFredMacroSignals(): Promise<MacroSignals> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      yieldCurveSpread: null, yield10y: null, fedFundsRate: null, fedFundsPrev: null,
      cpi: null, cpiPrev: null, unemployment: null, unemploymentPrev: null,
      creditSpread: null, fredAvailable: false,
    };
  }

  const [yieldCurveObs, yield10yObs, fedFundsObs, cpiObs, unemploymentObs, creditObs] =
    await Promise.all([
      fetchFredSeries("T10Y2Y", 3),
      fetchFredSeries("DGS10", 2),
      fetchFredSeries("FEDFUNDS", 3),
      fetchFredSeries("CPIAUCSL", 14), // need 13 months for YoY
      fetchFredSeries("UNRATE", 3),
      fetchFredSeries("BAMLH0A0HYM2", 2),
    ]);

  // Compute CPI YoY %
  let cpi: number | null = null;
  let cpiPrev: number | null = null;
  if (cpiObs.length >= 13) {
    const latest = parseFloat(cpiObs[0].value);
    const yearAgo = parseFloat(cpiObs[12].value);
    if (!isNaN(latest) && !isNaN(yearAgo) && yearAgo > 0) {
      cpi = ((latest - yearAgo) / yearAgo) * 100;
    }
    if (cpiObs.length >= 14) {
      const prev = parseFloat(cpiObs[1].value);
      const prevYearAgo = parseFloat(cpiObs[13].value);
      if (!isNaN(prev) && !isNaN(prevYearAgo) && prevYearAgo > 0) {
        cpiPrev = ((prev - prevYearAgo) / prevYearAgo) * 100;
      }
    }
  }

  return {
    yieldCurveSpread: latestValue(yieldCurveObs),
    yield10y: latestValue(yield10yObs),
    fedFundsRate: latestValue(fedFundsObs),
    fedFundsPrev: previousValue(fedFundsObs),
    cpi,
    cpiPrev,
    unemployment: latestValue(unemploymentObs),
    unemploymentPrev: previousValue(unemploymentObs),
    creditSpread: latestValue(creditObs),
    fredAvailable: true,
  };
}
