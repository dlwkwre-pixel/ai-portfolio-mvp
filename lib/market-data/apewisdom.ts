// Server-only — requires Node.js runtime (uses fetch, process.env)

import { createClient } from "@/lib/supabase/server";

const APEWISDOM_URL = "https://apewisdom.io/api/v1.0/filter/all-stocks";
const CACHE_TTL_MINUTES = 30;

export type ApeWisdomTicker = {
  ticker: string;
  name: string;
  mentions: number;
  mentions_24h_ago: number;
  mention_change_pct: number;
  upvotes: number;
  rank: number;
  rank_24h_ago: number;
  rank_change: number;
  reddit_trend_score: number;
};

type RawApeWisdomItem = {
  ticker?: string;
  name?: string;
  mentions?: number;
  mentions_24h_ago?: number;
  upvotes?: number;
  rank?: number;
  rank_24h_ago?: number;
};

function calcTrendScore(rank: number, mentionChangePct: number): number {
  let score = 40;

  // Rank bonus
  if (rank <= 5) score += 40;
  else if (rank <= 10) score += 30;
  else if (rank <= 25) score += 15;
  else if (rank <= 50) score += 5;

  // Mention growth bonus/penalty
  if (mentionChangePct > 100) score += 20;
  else if (mentionChangePct > 50) score += 12;
  else if (mentionChangePct > 25) score += 6;
  else if (mentionChangePct < -25) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function normalizeItem(raw: RawApeWisdomItem, rank: number): ApeWisdomTicker {
  const mentions = Number(raw.mentions ?? 0);
  const mentions24hAgo = Number(raw.mentions_24h_ago ?? 0);
  const rank24hAgo = Number(raw.rank_24h_ago ?? rank);

  const mentionChangePct =
    mentions24hAgo > 0
      ? Math.round(((mentions - mentions24hAgo) / mentions24hAgo) * 100)
      : 0;

  const rankChange = rank24hAgo - rank; // positive = improved rank

  return {
    ticker: String(raw.ticker ?? "").toUpperCase(),
    name: String(raw.name ?? ""),
    mentions,
    mentions_24h_ago: mentions24hAgo,
    mention_change_pct: mentionChangePct,
    upvotes: Number(raw.upvotes ?? 0),
    rank,
    rank_24h_ago: rank24hAgo,
    rank_change: rankChange,
    reddit_trend_score: calcTrendScore(rank, mentionChangePct),
  };
}

// ── Fetch from ApeWisdom API ───────────────────────────────────────────────────

async function fetchFromApi(): Promise<ApeWisdomTicker[] | null> {
  try {
    const res = await fetch(APEWISDOM_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "BuyTuneSocialPulse/0.1" },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { results?: RawApeWisdomItem[] };
    if (!Array.isArray(json.results)) return null;

    return json.results.map((item, i) => normalizeItem(item, i + 1));
  } catch {
    return null;
  }
}

// ── Main export: returns map of ticker → ApeWisdomTicker ─────────────────────
// Checks Supabase cache first (30-min TTL), then fetches live.

export async function fetchApeWisdomData(): Promise<Record<string, ApeWisdomTicker> | null> {
  const supabase = await createClient();

  // 1. Try fresh cache
  const { data: cached } = await supabase
    .from("apewisdom_cache")
    .select("snapshot_json, expires_at")
    .eq("id", "global")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached?.snapshot_json) {
    try {
      const tickers = JSON.parse(cached.snapshot_json) as ApeWisdomTicker[];
      return Object.fromEntries(tickers.map((t) => [t.ticker, t]));
    } catch {
      // fall through to live fetch
    }
  }

  // 2. Fetch live
  const tickers = await fetchFromApi();
  if (!tickers || tickers.length === 0) return null;

  // 3. Persist to Supabase
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);

  await supabase.from("apewisdom_cache").upsert(
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
