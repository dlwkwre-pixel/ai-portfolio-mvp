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

// Fetch the latest N valid observations for a FRED series.
// buffer controls how many raw observations to request before filtering "."/ND gaps.
async function fetchFredSeries(seriesId: string, count = 5, buffer = 50): Promise<FredObservation[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(buffer));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 14400 }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[fred] ${seriesId} → HTTP ${res.status}`);
      return [];
    }
    const data: FredSeriesResponse = await res.json();
    const valid = (data.observations ?? []).filter(
      (o) => o.value !== "." && o.value !== "" && o.value !== "ND"
    );
    if (valid.length === 0) {
      console.error(`[fred] ${seriesId} → 0 valid obs from ${(data.observations ?? []).length} fetched`);
    }
    return valid.slice(0, count);
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[fred] ${seriesId} → timeout after 15s`);
    } else {
      console.error(`[fred] ${seriesId} → fetch error:`, err);
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
  yieldCurveSpread: number | null;    // T10Y2Y or computed DGS10-DGS2
  yield10y: number | null;            // DGS10: 10-year treasury yield %
  fedFundsRate: number | null;        // FEDFUNDS: current fed funds rate %
  fedFundsPrev: number | null;        // Previous period (trend detection)
  // Inflation & employment
  cpi: number | null;                 // CPIAUCSL YoY % change (computed)
  cpiPrev: number | null;
  unemployment: number | null;        // UNRATE: current unemployment %
  unemploymentPrev: number | null;
  // Credit
  creditSpread: number | null;        // BAMLH0A0HYM2OAS high-yield OAS basis points
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

  const [yieldCurveObs, yield10yObs, dgs2Obs, fedFundsObs, cpiObs, unemploymentObs, creditObs] =
    await Promise.all([
      fetchFredSeries("T10Y2Y", 3, 50),
      fetchFredSeries("DGS10", 3, 50),
      fetchFredSeries("DGS2", 3, 50),           // fallback for yield curve spread
      fetchFredSeries("FEDFUNDS", 3, 10),        // monthly — small buffer fine
      fetchFredSeries("CPIAUCSL", 14, 30),       // monthly — 14 valid obs + buffer
      fetchFredSeries("UNRATE", 3, 10),          // monthly — small buffer fine
      fetchFredSeries("BAMLH0A0HYM2OAS", 3, 50), // daily — large buffer for pub lag
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

  // Yield curve spread: prefer T10Y2Y, fall back to DGS10 - DGS2
  let yieldCurveSpread = latestValue(yieldCurveObs);
  if (yieldCurveSpread === null) {
    const t10 = latestValue(yield10yObs);
    const t2  = latestValue(dgs2Obs);
    if (t10 !== null && t2 !== null) {
      yieldCurveSpread = Math.round((t10 - t2) * 100) / 100;
      console.error("[fred] T10Y2Y empty — computed spread from DGS10-DGS2:", yieldCurveSpread);
    }
  }

  // BAMLH0A0HYM2OAS is in percent (e.g. 3.5 = 350bps) — convert to basis points
  const creditPct = latestValue(creditObs);
  const creditSpread = creditPct !== null ? Math.round(creditPct * 100) : null;

  return {
    yieldCurveSpread,
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
