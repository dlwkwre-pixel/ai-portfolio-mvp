import type { FinnhubCandlesResponse } from "./finnhub";

export type KronosForecastPoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type KronosForecast = {
  ticker: string;
  predLen: number;
  points: KronosForecastPoint[];
  generatedAt: string;
};

type KronosHistoryRow = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function getServiceUrl(): string | null {
  const url = process.env.KRONOS_SERVICE_URL;
  return url ? url.replace(/\/$/, "") : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Same retry idiom as finnhub.ts, but retries here mainly absorb a Space
// waking from sleep (cold-start 5xx/timeout), not a rate limit — one retry
// is enough since a cold start already eats most of the request budget.
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 1): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(2000);

    try {
      const response = await fetch(url, options);
      if (response.status >= 500) {
        lastError = new Error(`Kronos service error (${response.status})`);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`Failed after ${maxRetries} retries`);
}

// Adapts Finnhub's parallel-array candle response into the row shape the
// Kronos service expects.
export function candlesToHistory(candles: FinnhubCandlesResponse): KronosHistoryRow[] {
  return candles.t.map((t, i) => ({
    timestamp: new Date(t * 1000).toISOString(),
    open: candles.o[i],
    high: candles.h[i],
    low: candles.l[i],
    close: candles.c[i],
    volume: candles.v[i] ?? 0,
  }));
}

export async function getKronosForecast(args: {
  ticker: string;
  history: KronosHistoryRow[];
  predLen?: number;
}): Promise<KronosForecast | null> {
  if (process.env.ENABLE_KRONOS_FORECAST !== "true") return null;

  const base = getServiceUrl();
  if (!base) return null;

  const ticker = args.ticker.trim().toUpperCase();
  if (!ticker || args.history.length < 30) return null;

  try {
    const response = await fetchWithRetry(`${base}/forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.KRONOS_API_KEY ? { "X-Api-Key": process.env.KRONOS_API_KEY } : {}),
      },
      body: JSON.stringify({
        ticker,
        history: args.history,
        pred_len: args.predLen ?? 10,
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { ticker?: string; forecast?: unknown };
    if (!Array.isArray(data?.forecast) || data.forecast.length === 0) return null;

    return {
      ticker,
      predLen: data.forecast.length,
      points: data.forecast as KronosForecastPoint[],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
