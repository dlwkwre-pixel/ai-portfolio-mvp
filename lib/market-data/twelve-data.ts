import type { CandlePoint } from "./chart-service";

type TwelveValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveResponse = {
  status: string;
  code?: number;
  message?: string;
  values?: TwelveValue[];
};

const TWELVE_CONFIG: Record<string, { interval: string; outputsize: number }> = {
  "1D": { interval: "5min",  outputsize: 80 },
  "1W": { interval: "1h",    outputsize: 40 },
  "1M": { interval: "1day",  outputsize: 23 },
  "3M": { interval: "1day",  outputsize: 68 },
  "1Y": { interval: "1week", outputsize: 53 },
};

export async function getTwelveDataCandles(ticker: string, range: string): Promise<CandlePoint[] | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const cfg = TWELVE_CONFIG[range];
  if (!cfg) return null;

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol",     ticker);
  url.searchParams.set("interval",   cfg.interval);
  url.searchParams.set("outputsize", String(cfg.outputsize));
  url.searchParams.set("apikey",     apiKey);
  url.searchParams.set("format",     "JSON");
  url.searchParams.set("country",    "United States");
  url.searchParams.set("timezone",   "UTC");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json() as TwelveResponse;
    if (data.status !== "ok" || !data.values || data.values.length === 0) return null;

    // Twelve Data returns newest-first — reverse to chronological
    const points = data.values
      .slice()
      .reverse()
      .map((v): CandlePoint => {
        // timezone=UTC requested, so all datetimes are UTC — append Z
        const iso = v.datetime.length === 10
          ? v.datetime + "T00:00:00Z"
          : v.datetime.replace(" ", "T") + "Z";
        return {
          timestamp: new Date(iso).getTime(),
          open:   Number(v.open),
          high:   Number(v.high),
          low:    Number(v.low),
          close:  Number(v.close),
          volume: Number(v.volume ?? 0),
          provider: "twelve_data",
        };
      })
      .filter((p) => Number.isFinite(p.close) && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}
