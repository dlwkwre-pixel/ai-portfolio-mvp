import { getFinnhubQuote } from "./finnhub";
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

async function getFmpDividendAdjustedHistory(symbol: string): Promise<BenchmarkBar[]> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    return [];
  }

  const url = new URL(
    "https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted"
  );
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(
      `FMP benchmark history request failed for ${normalizedSymbol} with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as FmpHistoryResponse;
  const rows = extractFmpRows(payload);

  const bars: BenchmarkBar[] = rows
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
    .filter((bar) => {
      return (
        bar.date.length > 0 &&
        Number.isFinite(bar.close) &&
        bar.close > 0 &&
        Number.isFinite(bar.adjClose) &&
        bar.adjClose > 0
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return bars;
}

export async function getBenchmarkHistory(
  symbol: string = "SPY",
  range: RangeKey = "1Y",
  includeLivePoint: boolean = true
): Promise<BenchmarkBar[]> {
  let bars = await getFmpDividendAdjustedHistory(symbol);
  bars = filterRange(bars, range);

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