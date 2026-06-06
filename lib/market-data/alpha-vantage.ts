import type { CandlePoint } from "./chart-service";

type AVBar = Record<string, string>;

type AVResponse = {
  "Information"?: string;
  "Note"?: string;
  [key: string]: AVBar | string | undefined;
};

type RangeCfg = {
  fn: string;
  interval?: string;
  size?: string;
  seriesKey: string;
  limit: number;
};

const SERIES_CONFIG: Record<string, RangeCfg> = {
  "1D": { fn: "TIME_SERIES_INTRADAY", interval: "5min",  size: "compact", seriesKey: "Time Series (5min)",  limit: 80 },
  "1W": { fn: "TIME_SERIES_INTRADAY", interval: "60min", size: "compact", seriesKey: "Time Series (60min)", limit: 40 },
  "1M": { fn: "TIME_SERIES_DAILY",                        size: "compact", seriesKey: "Time Series (Daily)", limit: 23 },
  "3M": { fn: "TIME_SERIES_DAILY",                        size: "full",    seriesKey: "Time Series (Daily)", limit: 68 },
  "1Y": { fn: "TIME_SERIES_WEEKLY",                                         seriesKey: "Weekly Time Series",  limit: 53 },
};

export type AVNewsItem = {
  title: string;
  summary: string;
  url: string;
  time_published: string;
  source: string;
  topics: { topic: string; relevance_score: string }[];
  overall_sentiment_label: string;
};

export async function getAlphaVantageNews(limit = 50): Promise<AVNewsItem[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];
  try {
    const topics = "financial_markets,economy_macro,economy_monetary,energy_transportation,technology";
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=${topics}&sort=LATEST&limit=${limit}&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json() as { feed?: AVNewsItem[]; Information?: string };
    if (data.Information) return []; // rate limited
    return data.feed ?? [];
  } catch {
    return [];
  }
}

export async function getAlphaVantageCandles(ticker: string, range: string): Promise<CandlePoint[] | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const cfg = SERIES_CONFIG[range];
  if (!cfg) return null;

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", cfg.fn);
  url.searchParams.set("symbol",   ticker);
  url.searchParams.set("apikey",   apiKey);
  if (cfg.interval) url.searchParams.set("interval",    cfg.interval);
  if (cfg.size)     url.searchParams.set("outputsize",  cfg.size);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json() as AVResponse;

    // Rate-limited or premium-only endpoint
    if (data["Information"] || data["Note"]) return null;

    const series = data[cfg.seriesKey] as Record<string, AVBar> | undefined;
    if (!series) return null;

    const entries = Object.entries(series)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-cfg.limit);

    const points = entries
      .map(([datetime, vals]): CandlePoint => ({
        timestamp: new Date(
          datetime.length === 10 ? datetime + "T00:00:00Z" : datetime
        ).getTime(),
        open:   Number(vals["1. open"]),
        high:   Number(vals["2. high"]),
        low:    Number(vals["3. low"]),
        close:  Number(vals["4. close"]),
        volume: Number(vals["5. volume"] ?? 0),
        provider: "alpha_vantage",
      }))
      .filter((p) => Number.isFinite(p.close) && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}
