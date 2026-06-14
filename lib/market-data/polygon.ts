const POLYGON_BASE = "https://api.polygon.io";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PolygonBar = {
  t: number; // epoch ms
  c: number; // adjusted close
};

type PolygonAggResponse = {
  status: string;
  results?: PolygonBar[];
};

/**
 * Fetch daily adjusted closes for a single ticker over a date range.
 * Returns a map of YYYY-MM-DD → close price.
 * Free tier: 5 calls/min — callers must space calls at least 12s apart.
 */
export async function getPolygonEOD(
  ticker: string,
  from: string, // YYYY-MM-DD
  to: string    // YYYY-MM-DD
): Promise<Map<string, number>> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return new Map();

  const url =
    `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new Map();
    const data: PolygonAggResponse = await res.json();
    if (!data.results) return new Map();

    const result = new Map<string, number>();
    for (const bar of data.results) {
      if (typeof bar.c !== "number" || bar.c <= 0) continue;
      const date = new Date(bar.t).toISOString().slice(0, 10);
      result.set(date, bar.c);
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * Fetch EOD prices for multiple tickers over the same date range.
 * Handles the free-tier 5-call/minute rate limit with 13s delays between calls.
 * Returns a map of ticker → (date → close price).
 */
export async function getPolygonEODBatch(
  tickers: string[],
  from: string,
  to: string
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  for (let i = 0; i < unique.length; i++) {
    const ticker = unique[i];
    const prices = await getPolygonEOD(ticker, from, to);
    result.set(ticker, prices);
    // Rate-limit: stay comfortably under 5 calls/min (13s gap = ~4.6/min)
    if (i < unique.length - 1) await sleep(13000);
  }

  return result;
}
