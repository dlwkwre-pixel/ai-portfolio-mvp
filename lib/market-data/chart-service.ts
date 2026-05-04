import type { FinnhubCandlesResponse } from "./finnhub";
import { getTwelveDataCandles } from "./twelve-data";
import { getAlphaVantageCandles } from "./alpha-vantage";

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export type CandlePoint = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
};

const RANGE_TTL_MS: Record<ChartRange, number> = {
  "1D":  3  * 60 * 1000,
  "1W":  20 * 60 * 1000,
  "1M":  45 * 60 * 1000,
  "3M":  3  * 60 * 60 * 1000,
  "1Y":  12 * 60 * 60 * 1000,
};

const FINNHUB_RESOLUTION: Record<ChartRange, string> = {
  "1D": "5",
  "1W": "60",
  "1M": "D",
  "3M": "D",
  "1Y": "W",
};

// Extra days buffer to handle weekends / market closures
const RANGE_LOOKBACK_DAYS: Record<ChartRange, number> = {
  "1D":  2,
  "1W":  8,
  "1M":  33,
  "3M":  93,
  "1Y":  368,
};

// Module-level caches — survive warm container reuse
const _cache    = new Map<string, { data: CandlePoint[]; expiresAt: number }>();
const _inflight = new Map<string, Promise<CandlePoint[]>>();

export async function getStockCandles(ticker: string, range: ChartRange): Promise<CandlePoint[]> {
  const sym = ticker.toUpperCase().trim();
  if (!sym) return [];
  const key = `${sym}:${range}`;

  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = _inflight.get(key);
  if (existing) return existing;

  const promise = _fetchFromProviders(sym, range)
    .then((data) => {
      _cache.set(key, { data, expiresAt: Date.now() + RANGE_TTL_MS[range] });
      return data;
    })
    .finally(() => _inflight.delete(key));

  _inflight.set(key, promise);
  return promise;
}

async function _fetchFromProviders(ticker: string, range: ChartRange): Promise<CandlePoint[]> {
  // 1. Twelve Data
  if (process.env.ENABLE_TWELVE_DATA_CHARTS === "true" && process.env.TWELVE_DATA_API_KEY) {
    try {
      const data = await getTwelveDataCandles(ticker, range);
      if (data && data.length >= 2) return data;
    } catch { /* fall through */ }
  }

  // 2. Alpha Vantage
  if (process.env.ENABLE_ALPHA_VANTAGE_CHARTS === "true" && process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const data = await getAlphaVantageCandles(ticker, range);
      if (data && data.length >= 2) return data;
    } catch { /* fall through */ }
  }

  // 3. Finnhub candles fallback
  const apiKey = process.env.FINNHUB_API_KEY;
  if (apiKey) {
    try {
      const now  = Math.floor(Date.now() / 1000);
      const from = now - RANGE_LOOKBACK_DAYS[range] * 86400;

      const url = new URL("https://finnhub.io/api/v1/stock/candle");
      url.searchParams.set("symbol",     ticker);
      url.searchParams.set("resolution", FINNHUB_RESOLUTION[range]);
      url.searchParams.set("from",       String(from));
      url.searchParams.set("to",         String(now));
      url.searchParams.set("token",      apiKey);

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
        // bypass Next.js fetch cache — handled above
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.json() as Partial<FinnhubCandlesResponse>;
      if (raw?.s === "ok" && Array.isArray(raw.c) && Array.isArray(raw.t) && raw.c.length >= 2) {
        const cs = raw.c as number[];
        const ts = raw.t as number[];
        return ts.map((timestamp, i): CandlePoint => ({
          timestamp: timestamp * 1000,
          open:   (raw.o ?? cs)[i],
          high:   (raw.h ?? cs)[i],
          low:    (raw.l ?? cs)[i],
          close:  cs[i],
          volume: (raw.v ?? [])[i] ?? 0,
          provider: "finnhub",
        }));
      }
    } catch { /* fall through */ }
  }

  return [];
}
