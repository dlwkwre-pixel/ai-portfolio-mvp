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

// Fetch the latest N observations for a FRED series.
// We request 2× the needed count to absorb "." gaps (weekends, holidays, publication lags)
// that FRED returns before filtering. No observation_start filter — desc+limit is enough.
async function fetchFredSeries(seriesId: string, count = 5): Promise<FredObservation[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  // Fetch 2× the requested count so "." gaps don't leave us short after filtering
  const fetchCount = Math.max(count * 2, 20);

  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(fetchCount));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[fred] ${seriesId} → HTTP ${res.status}`);
      return [];
    }
    const data: FredSeriesResponse = await res.json();
    // Filter "." (unreleased) and empty values, then return only the N most recent valid ones
    const valid = (data.observations ?? []).filter((o) => o.value !== "." && o.value !== "" && o.value !== "ND");
    return valid.slice(0, count);
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[fred] ${seriesId} → timeout`);
    }
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
      fetchFredSeries("T10Y2Y", 3),           // daily — fetchFredSeries fetches 2× internally
      fetchFredSeries("DGS10", 3),
      fetchFredSeries("FEDFUNDS", 3),
      fetchFredSeries("CPIAUCSL", 14),         // 14 valid obs needed for YoY + prev
      fetchFredSeries("UNRATE", 3),
      fetchFredSeries("BAMLH0A0HYM2OAS", 3),  // daily — 2× fetch handles weekend gaps
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

  // BAMLH0A0HYM2OAS is in percent (e.g. 3.5 = 350bps) — convert to basis points for scoring
  const creditPct = latestValue(creditObs);
  const creditSpread = creditPct !== null ? Math.round(creditPct * 100) : null;

  return {
    yieldCurveSpread: latestValue(yieldCurveObs),
    yield10y: latestValue(yield10yObs),
    fedFundsRate: latestValue(fedFundsObs),
    fedFundsPrev: previousValue(fedFundsObs),
    cpi,
    cpiPrev,
    unemployment: latestValue(unemploymentObs),
    unemploymentPrev: previousValue(unemploymentObs),
    creditSpread,
    fredAvailable: true,
  };
}
