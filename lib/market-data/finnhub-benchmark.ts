import { getFinnhubQuote, getFinnhubDailyCandles } from "./finnhub";
import type { BenchmarkBar, IndexedPoint, RangeKey } from "./type";

type FmpHistoryRow = {
  symbol?: string;
  date?: string;
  close?: number | string;
  price?: number | string;
  adjClose?: number | string;
  adjustedClose?: number | string;
  adjOpen?: number | string;
  adjHigh?: number | string;
  adjLow?: number | string;
  volume?: number | string;
};

type FmpHistoryResponse =
  | FmpHistoryRow[]
  | {
      historical?: FmpHistoryRow[];
    };

function startDateForRange(range: RangeKey): Date | null {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (range) {
    case "1M":
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d;
    case "3M":
      d.setUTCMonth(d.getUTCMonth() - 3);
      return d;
    case "6M":
      d.setUTCMonth(d.getUTCMonth() - 6);
      return d;
    case "YTD":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "1Y":
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return d;
    case "3Y":
      d.setUTCFullYear(d.getUTCFullYear() - 3);
      return d;
    case "5Y":
      d.setUTCFullYear(d.getUTCFullYear() - 5);
      return d;
    case "MAX":
      return null;
    default:
      return null;
  }
}

function filterRange(bars: BenchmarkBar[], range: RangeKey): BenchmarkBar[] {
  const start = startDateForRange(range);

  if (!start) {
    return bars;
  }

  const startStr = start.toISOString().slice(0, 10);
  return bars.filter((bar) => bar.date >= startStr);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractFmpRows(payload: FmpHistoryResponse): FmpHistoryRow[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.historical)) {
    return payload.historical;
  }

  return [];
}

function parseFmpRows(rows: FmpHistoryRow[]): BenchmarkBar[] {
  return rows
    .map((row) => {
      const adjClose = toNumber(
        row.adjClose ?? row.adjustedClose ?? row.close ?? row.price ?? 0
      );
      const close = toNumber(
        row.close ?? row.price ?? row.adjClose ?? row.adjustedClose ?? 0
      );
      const volumeValue = row.volume == null ? undefined : toNumber(row.volume);
      return {
        date: String(row.date ?? "").slice(0, 10),
        close,
        adjClose,
        volume: volumeValue,
        source: "fmp" as const,
      };
    })
    .filter((bar) => (
      bar.date.length > 0 &&
      Number.isFinite(bar.close) && bar.close > 0 &&
      Number.isFinite(bar.adjClose) && bar.adjClose > 0
    ))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getFmpDividendAdjustedHistory(symbol: string, bustCache = false): Promise<BenchmarkBar[]> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];

  const url = new URL(
    "https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted"
  );
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      ...(bustCache ? { cache: "no-store" } : { next: { revalidate: 21600 } }),
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as FmpHistoryResponse;
    return parseFmpRows(extractFmpRows(payload));
  } catch {
    return [];
  }
}

// FMP v3 endpoint — broader ticker coverage than the stable dividend-adjusted endpoint
async function getFmpV3History(symbol: string, bustCache = false): Promise<BenchmarkBar[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];

  const url = new URL(
    `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(normalizedSymbol)}`
  );
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      ...(bustCache ? { cache: "no-store" } : { next: { revalidate: 21600 } }),
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as FmpHistoryResponse;
    return parseFmpRows(extractFmpRows(payload));
  } catch {
    return [];
  }
}

async function getFinnhubCandleHistoryAsBars(symbol: string, range: RangeKey, bustCache = false): Promise<BenchmarkBar[]> {
  const toDate = new Date();
  // For MAX, go back 5 years; otherwise use the computed range start
  const fromDate = startDateForRange(range) ?? new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000);
  const fromUnix = Math.floor(fromDate.getTime() / 1000);
  const toUnix = Math.floor(toDate.getTime() / 1000);

  const candles = await getFinnhubDailyCandles({ symbol, fromUnix, toUnix, bustCache });
  if (!candles || candles.c.length === 0) return [];

  const bars: BenchmarkBar[] = [];
  for (let i = 0; i < candles.t.length; i++) {
    const close = candles.c[i];
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = new Date(candles.t[i] * 1000).toISOString().slice(0, 10);
    // Finnhub candles don't provide split-adjusted prices; use close as both fields.
    // Acceptable for reconstruction purposes since we're computing relative returns.
    bars.push({ date, close, adjClose: close, source: "finnhub" as const });
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getBenchmarkHistory(
  symbol: string = "SPY",
  range: RangeKey = "1Y",
  includeLivePoint: boolean = true,
  bustCache: boolean = false
): Promise<BenchmarkBar[]> {
  let bars = await getFmpDividendAdjustedHistory(symbol, bustCache);
  bars = filterRange(bars, range);

  // FMP v3 fallback — wider ticker coverage than the stable endpoint
  if (bars.length === 0) {
    bars = filterRange(await getFmpV3History(symbol, bustCache), range);
  }

  // Finnhub candle fallback — last resort when both FMP endpoints return nothing
  if (bars.length === 0) {
    bars = await getFinnhubCandleHistoryAsBars(symbol, range, bustCache);
  }

  if (bars.length === 0) {
    return bars;
  }

  const last = bars[bars.length - 1];
  const today = new Date().toISOString().slice(0, 10);

  if (includeLivePoint && last.date !== today) {
    try {
      const quote = await getFinnhubQuote(symbol);

      if (quote && quote.c > 0 && last.close > 0) {
        const liveAdjClose = last.adjClose * (quote.c / last.close);

        bars = [
          ...bars,
          {
            date: today,
            close: quote.c,
            adjClose: liveAdjClose,
            source: "finnhub",
          },
        ];
      }
    } catch {
      // Soft fail: return FMP EOD history only.
    }
  }

  return bars;
}

export function toIndexedSeries(bars: BenchmarkBar[]): IndexedPoint[] {
  if (bars.length === 0) {
    return [];
  }

  const base = bars[0].adjClose;

  if (!Number.isFinite(base) || base <= 0) {
    return [];
  }

  return bars.map((bar) => ({
    date: bar.date,
    value: (bar.adjClose / base) * 100,
  }));
}