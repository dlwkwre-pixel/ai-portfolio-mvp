// Server-only — requires Node.js runtime.
// Free, no-key Tradestie API: top-50 WallStreetBets tickers, refreshed every
// ~15 min, with an actual sentiment field (unlike ApeWisdom's mentions/rank
// only). No signup required — this is the WSB-specific "what's trending"
// signal; StockGeist (lib/market-data/stockgeist.ts) covers the much larger
// per-ticker universe and is the primary source for tickers outside WSB's top 50.

import { createClient } from "@/lib/supabase/server";

const TRADESTIE_URL = "https://api.tradestie.com/v1/apps/reddit";
const CACHE_TTL_MINUTES = 15;

export type TradestieTicker = {
  ticker: string;
  no_of_comments: number;
  sentiment: string;        // e.g. "Bullish" | "Bearish"
  sentiment_score: number;  // provider's raw sentiment score
  rank: number;              // position in the top-50 list, 1 = most discussed
};

type RawTradestieItem = {
  ticker?: string;
  no_of_comments?: number;
  sentiment?: string;
  sentiment_score?: number;
};

function normalizeItem(raw: RawTradestieItem, rank: number): TradestieTicker {
  return {
    ticker: String(raw.ticker ?? "").toUpperCase(),
    no_of_comments: Number(raw.no_of_comments ?? 0),
    sentiment: String(raw.sentiment ?? "Neutral"),
    sentiment_score: Number(raw.sentiment_score ?? 0),
    rank,
  };
}

async function fetchFromApi(): Promise<TradestieTicker[] | null> {
  try {
    const res = await fetch(TRADESTIE_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "BuyTuneSocialPulse/0.1" },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as RawTradestieItem[];
    if (!Array.isArray(json)) return null;

    return json.map((item, i) => normalizeItem(item, i + 1));
  } catch {
    return null;
  }
}

// Returns map of ticker → TradestieTicker. Checks Supabase cache first
// (15-min TTL, matching Tradestie's own refresh cadence), then fetches live.
export async function fetchTradestieData(): Promise<Record<string, TradestieTicker> | null> {
  const supabase = await createClient();

  const { data: cached } = await supabase
    .from("tradestie_cache")
    .select("snapshot_json, expires_at")
    .eq("id", "global")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached?.snapshot_json) {
    try {
      const tickers = JSON.parse(cached.snapshot_json) as TradestieTicker[];
      return Object.fromEntries(tickers.map((t) => [t.ticker, t]));
    } catch {
      // fall through to live fetch
    }
  }

  const tickers = await fetchFromApi();
  if (!tickers || tickers.length === 0) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);

  await supabase.from("tradestie_cache").upsert(
    {
      id: "global",
      snapshot_json: JSON.stringify(tickers),
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "id" }
  );

  return Object.fromEntries(tickers.map((t) => [t.ticker, t]));
}
