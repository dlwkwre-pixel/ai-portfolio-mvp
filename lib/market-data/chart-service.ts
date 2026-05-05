import type { FinnhubCandlesResponse } from "./finnhub";
import { getTwelveDataCandles } from "./twelve-data";
import { getAlphaVantageCandles } from "./alpha-vantage";
import { getChartCacheDb, setChartCacheDb } from "./chart-cache-db";

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

export type ChartResult = {
  candles: CandlePoint[];
  provider: string | null;
  /** Only populated in development */
  _debug?: {
    providers_tried: string[];
    failure_reasons: Record<string, string>;
    symbol_normalized: string;
  };
};

// ── TTLs ──────────────────────────────────────────────────────────────────────

const RANGE_TTL_MS: Record<ChartRange, number> = {
  "1D":  3  * 60 * 1000,
  "1W":  20 * 60 * 1000,
  "1M":  45 * 60 * 1000,
  "3M":  3  * 60 * 60 * 1000,
  "1Y":  12 * 60 * 60 * 1000,
};

// Short TTL when all providers returned empty — avoids caching rate-limit misses
const EMPTY_TTL_MS = 30 * 1000;

// ── Finnhub config ────────────────────────────────────────────────────────────

const FINNHUB_RESOLUTION: Record<ChartRange, string> = {
  "1D": "5",   // 5-min intraday (free tier: may return no_data)
  "1W": "60",
  "1M": "D",
  "3M": "D",
  "1Y": "W",
};

const RANGE_LOOKBACK_DAYS: Record<ChartRange, number> = {
  "1D":  2,
  "1W":  8,
  "1M":  33,
  "3M":  93,
  "1Y":  368,
};

// ── Caches ────────────────────────────────────────────────────────────────────

const _cache    = new Map<string, { result: ChartResult; expiresAt: number }>();
const _inflight = new Map<string, Promise<ChartResult>>();

// ── Symbol normalization ──────────────────────────────────────────────────────

/**
 * Normalize a BuyTune canonical ticker for each provider's symbol convention.
 *   BRK.B → BRK/B  (Twelve Data uses slash for NYSE composite class shares)
 *   BRK.B → BRK.B  (Finnhub and Alpha Vantage accept dot notation)
 */
export function normalizeForProvider(
  ticker: string,
  provider: "twelve_data" | "alpha_vantage" | "finnhub"
): string {
  if (provider === "twelve_data") {
    // NYSE class-share tickers use "/" in Twelve Data (BRK/B, BRK/A)
    return ticker.replace(/\./g, "/");
  }
  // Alpha Vantage and Finnhub: keep as-is
  return ticker;
}

// ── Dev logging ───────────────────────────────────────────────────────────────

const DEV = process.env.NODE_ENV === "development";
function clog(msg: string) {
  if (DEV) console.log(`[chart-service] ${msg}`);
}

// ── 1D session filter ─────────────────────────────────────────────────────────

/**
 * Strip candles from previous trading sessions.
 * Finds the last gap >= 4 hours (overnight break) and returns only bars after it.
 * Works regardless of timezone — gap-based, not date-based.
 */
function _filterToLastSession(candles: CandlePoint[]): CandlePoint[] {
  for (let i = candles.length - 1; i > 0; i--) {
    if (candles[i].timestamp - candles[i - 1].timestamp >= 4 * 60 * 60 * 1000) {
      return candles.slice(i);
    }
  }
  return candles;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getStockCandles(ticker: string, range: ChartRange): Promise<ChartResult> {
  const sym = ticker.toUpperCase().trim();
  if (!sym) return { candles: [], provider: null };
  const key = `${sym}:${range}`;

  // 1. In-memory cache (fastest — same Vercel instance)
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    clog(`mem-cache  ${key} (${cached.result.candles.length} bars)`);
    return cached.result;
  }

  // 2. Dedup in-flight requests
  const existing = _inflight.get(key);
  if (existing) {
    clog(`dedup hit  ${key}`);
    return existing;
  }

  const promise = (async () => {
    // 3. Supabase persistent cache (shared across all Vercel instances + users)
    const dbHit = await getChartCacheDb(key);
    if (dbHit && dbHit.candles.length >= 2) {
      clog(`db-cache   ${key} (${dbHit.candles.length} bars from ${dbHit.provider})`);
      _cache.set(key, { result: dbHit, expiresAt: Date.now() + RANGE_TTL_MS[range] });
      return dbHit;
    }

    // 4. Fetch from providers
    const result = await _fetchFromProviders(sym, range);
    const candles = range === "1D" && result.candles.length >= 2
      ? _filterToLastSession(result.candles)
      : result.candles;
    const filtered = candles === result.candles ? result : { ...result, candles };
    const ttl = filtered.candles.length >= 2 ? RANGE_TTL_MS[range] : EMPTY_TTL_MS;

    _cache.set(key, { result: filtered, expiresAt: Date.now() + ttl });
    clog(`fetched    ${key} — ${filtered.candles.length} bars from ${filtered.provider ?? "none"} (ttl ${ttl / 1000}s)`);

    // Store in Supabase — fire-and-forget, non-fatal
    if (filtered.candles.length >= 2) {
      setChartCacheDb(key, filtered, ttl).catch(() => {});
    }

    return filtered;
  })().finally(() => _inflight.delete(key));

  _inflight.set(key, promise);
  return promise;
}

// ── Provider chain ────────────────────────────────────────────────────────────

async function _fetchFromProviders(ticker: string, range: ChartRange): Promise<ChartResult> {
  const tried: string[]               = [];
  const reasons: Record<string, string> = {};

  // ── 1. Twelve Data ──────────────────────────────────────────────────────────
  if (process.env.ENABLE_TWELVE_DATA_CHARTS === "true" && process.env.TWELVE_DATA_API_KEY) {
    tried.push("twelve_data");
    try {
      const sym  = normalizeForProvider(ticker, "twelve_data");
      clog(`trying twelve_data for ${sym} (${range})`);
      const data = await getTwelveDataCandles(sym, range);
      if (data && data.length >= 2) {
        clog(`twelve_data OK — ${data.length} bars`);
        return _ok(data, "twelve_data", tried, reasons, ticker);
      }
      const why = data === null ? "null response" : `only ${data?.length ?? 0} bars`;
      reasons["twelve_data"] = why;
      clog(`twelve_data failed: ${why}`);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      reasons["twelve_data"] = why;
      clog(`twelve_data threw: ${why}`);
    }
  }

  // ── 2. Alpha Vantage ────────────────────────────────────────────────────────
  if (process.env.ENABLE_ALPHA_VANTAGE_CHARTS === "true" && process.env.ALPHA_VANTAGE_API_KEY) {
    tried.push("alpha_vantage");
    try {
      const sym  = normalizeForProvider(ticker, "alpha_vantage");
      clog(`trying alpha_vantage for ${sym} (${range})`);
      const data = await getAlphaVantageCandles(sym, range);
      if (data && data.length >= 2) {
        clog(`alpha_vantage OK — ${data.length} bars`);
        return _ok(data, "alpha_vantage", tried, reasons, ticker);
      }
      const why = data === null ? "null response" : `only ${data?.length ?? 0} bars`;
      reasons["alpha_vantage"] = why;
      clog(`alpha_vantage failed: ${why}`);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      reasons["alpha_vantage"] = why;
      clog(`alpha_vantage threw: ${why}`);
    }
  }

  // ── 3. Finnhub candles fallback ─────────────────────────────────────────────
  const fhKey = process.env.FINNHUB_API_KEY;
  if (fhKey) {
    tried.push("finnhub");
    const sym = normalizeForProvider(ticker, "finnhub");
    clog(`trying finnhub for ${sym} (${range})`);

    // For 1D: try intraday first, then fall back to daily candles if free tier
    // returns no_data (intraday is restricted on free plan for some accounts)
    const data = await _finnhubCandles(sym, range, fhKey)
      ?? (range === "1D" ? await _finnhubCandles(sym, "1D_daily_fallback" as ChartRange, fhKey) : null);

    if (data && data.length >= 2) {
      clog(`finnhub OK — ${data.length} bars`);
      return _ok(data, "finnhub", tried, reasons, ticker);
    }
    const why = data === null ? "no_data / HTTP error" : `only ${data?.length ?? 0} bars`;
    reasons["finnhub"] = why;
    clog(`finnhub failed: ${why}`);
  }

  clog(`all providers failed for ${ticker} (${range}) — tried: ${tried.join(", ")}`);
  return { candles: [], provider: null, ...(DEV ? { _debug: { providers_tried: tried, failure_reasons: reasons, symbol_normalized: ticker } } : {}) };
}

function _ok(
  candles: CandlePoint[],
  provider: string,
  tried: string[],
  reasons: Record<string, string>,
  sym: string,
): ChartResult {
  return {
    candles,
    provider,
    ...(DEV ? { _debug: { providers_tried: tried, failure_reasons: reasons, symbol_normalized: sym } } : {}),
  };
}

// ── Finnhub fetch helper ──────────────────────────────────────────────────────

async function _finnhubCandles(
  ticker: string,
  range: ChartRange | "1D_daily_fallback",
  apiKey: string,
): Promise<CandlePoint[] | null> {
  const is1DFallback = range === "1D_daily_fallback";
  const effectiveRange: ChartRange = is1DFallback ? "1D" : range;

  const resolution = is1DFallback ? "D" : FINNHUB_RESOLUTION[effectiveRange];
  const lookbackDays = is1DFallback ? 7 : RANGE_LOOKBACK_DAYS[effectiveRange];

  const now  = Math.floor(Date.now() / 1000);
  const from = now - lookbackDays * 86400;

  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol",     ticker);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from",       String(from));
  url.searchParams.set("to",         String(now));
  url.searchParams.set("token",      apiKey);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (res.status === 429) { clog("finnhub rate-limited (429)"); return null; }
    if (!res.ok) { clog(`finnhub HTTP ${res.status}`); return null; }

    const raw = await res.json() as Partial<FinnhubCandlesResponse>;

    if (raw?.s !== "ok") {
      clog(`finnhub s=${raw?.s ?? "missing"} for ${ticker} res=${resolution}`);
      return null;
    }

    if (!Array.isArray(raw.c) || !Array.isArray(raw.t) || raw.c.length < 2) return null;

    const cs = raw.c as number[];
    const ts = raw.t as number[];
    const providerLabel = is1DFallback ? "finnhub_daily" : "finnhub";

    return ts.map((timestamp, i): CandlePoint => ({
      timestamp: timestamp * 1000,
      open:   (raw.o ?? cs)[i],
      high:   (raw.h ?? cs)[i],
      low:    (raw.l ?? cs)[i],
      close:  cs[i],
      volume: (raw.v ?? [])[i] ?? 0,
      provider: providerLabel,
    }));
  } catch (err) {
    clog(`finnhub fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
