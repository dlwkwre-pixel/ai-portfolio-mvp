// Server-only — requires Node.js runtime.
// StockGeist REST API: per-ticker sentiment across ~2,200 US tickers, sourced
// from social + news (not just Reddit/WSB) — the primary source for tickers
// outside Tradestie's WSB top-50. Free tier: 10k credits/mo. Requires
// STOCKGEIST_API_KEY — this module no-ops (returns null) until that's set.
//
// Response shape verified only against StockGeist's public Python client
// source (github.com/stockgeist/stockgeist-client-python) — the exact JSON
// field layout wasn't confirmable without a live key, so parsing here is
// deliberately defensive (handles both a columnar and a row-based shape).
// Worth a live smoke test once STOCKGEIST_API_KEY is added.

import { createClient } from "@/lib/supabase/server";

const BASE_URL = "https://api.stockgeist.ai/";
const CACHE_TTL_MINUTES = 20;

export type StockGeistSentiment = {
  ticker: string;
  timeframe: string;
  total_count: number;
  positive_count: number;
  negative_count: number;
  pos_index: number | null;   // StockGeist's headline sentiment score
  sentiment_label: string;    // derived locally from pos_index
};

function labelFromPosIndex(posIndex: number | null): string {
  if (posIndex === null) return "Insufficient Data";
  if (posIndex >= 0.7) return "Very Bullish";
  if (posIndex >= 0.58) return "Bullish";
  if (posIndex >= 0.52) return "Moderately Bullish";
  if (posIndex <= 0.3) return "Very Bearish";
  if (posIndex <= 0.42) return "Bearish";
  if (posIndex <= 0.48) return "Moderately Bearish";
  return "Neutral";
}

// Normalizes either a columnar response ({ pos_index: [...], total_count: [...] })
// or a row-based one ({ data: [{ pos_index, total_count, ... }] }), taking the
// most recent data point either way.
function parseResponse(json: unknown, ticker: string, timeframe: string): StockGeistSentiment | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  // Row-based: { data: [ {...}, {...} ] } — take the last (most recent) row
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const row = obj.data[obj.data.length - 1] as Record<string, unknown>;
    return buildFromFields(row, ticker, timeframe);
  }

  // Columnar: { pos_index: [...], total_count: [...], ... } — take the last index of each array
  if (Array.isArray(obj.pos_index) || Array.isArray(obj.total_count)) {
    const lastIdx = (arr: unknown) => (Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : undefined);
    return buildFromFields(
      {
        pos_index: lastIdx(obj.pos_index),
        total_count: lastIdx(obj.total_count),
        inf_positive_count: lastIdx(obj.inf_positive_count),
        inf_negative_count: lastIdx(obj.inf_negative_count),
        em_positive_count: lastIdx(obj.em_positive_count),
        em_negative_count: lastIdx(obj.em_negative_count),
      },
      ticker,
      timeframe
    );
  }

  // Flat single-object response: { pos_index, total_count, ... }
  if ("pos_index" in obj || "total_count" in obj) {
    return buildFromFields(obj, ticker, timeframe);
  }

  return null;
}

function buildFromFields(row: Record<string, unknown>, ticker: string, timeframe: string): StockGeistSentiment | null {
  const posIndex = row.pos_index !== undefined && row.pos_index !== null ? Number(row.pos_index) : null;
  const totalCount = Number(row.total_count ?? 0);
  const positiveCount = Number(row.inf_positive_count ?? 0) + Number(row.em_positive_count ?? 0);
  const negativeCount = Number(row.inf_negative_count ?? 0) + Number(row.em_negative_count ?? 0);

  return {
    ticker: ticker.toUpperCase(),
    timeframe,
    total_count: totalCount,
    positive_count: positiveCount,
    negative_count: negativeCount,
    pos_index: posIndex !== null && !Number.isNaN(posIndex) ? posIndex : null,
    sentiment_label: labelFromPosIndex(posIndex),
  };
}

async function fetchFromApi(ticker: string, timeframe: string, apiKey: string): Promise<StockGeistSentiment | null> {
  try {
    const params = new URLSearchParams({
      symbol: ticker.toUpperCase(),
      timeframe,
      filter: "pos_index,total_count,inf_positive_count,inf_negative_count,em_positive_count,em_negative_count",
      token: apiKey,
    });
    const res = await fetch(`${BASE_URL}time-series/message-metrics?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    return parseResponse(json, ticker, timeframe);
  } catch {
    return null;
  }
}

// Returns sentiment for a single ticker, or null if unavailable/not configured.
// Checks Supabase cache first (20-min TTL), then fetches live.
export async function getStockGeistSentiment(
  ticker: string,
  timeframe: "5m" | "1h" | "1d" = "1d"
): Promise<StockGeistSentiment | null> {
  const apiKey = process.env.STOCKGEIST_API_KEY;
  if (!apiKey) return null;

  const t = ticker.trim().toUpperCase();
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("stockgeist_sentiment_cache")
    .select("raw_json, expires_at")
    .eq("ticker", t)
    .eq("timeframe", timeframe)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached?.raw_json) {
    try {
      return JSON.parse(cached.raw_json) as StockGeistSentiment;
    } catch {
      // fall through to live fetch
    }
  }

  const result = await fetchFromApi(t, timeframe, apiKey);
  if (!result) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);

  await supabase.from("stockgeist_sentiment_cache").upsert(
    {
      ticker: t,
      timeframe,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      total_count: result.total_count,
      positive_count: result.positive_count,
      negative_count: result.negative_count,
      pos_index: result.pos_index,
      raw_json: JSON.stringify(result),
      updated_at: now.toISOString(),
    },
    { onConflict: "ticker,timeframe" }
  );

  return result;
}
