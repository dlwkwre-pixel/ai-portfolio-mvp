import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchRedditPosts } from "@/lib/market-data/reddit";
import { buildRedditPulse, type RedditPulseData } from "@/lib/market-data/reddit-pulse";

const CACHE_TTL_MINUTES = 120;

// ─── GET /api/social-pulse/[ticker] ───────────────────────────────────────────
// Query params:
//   company  — company name for better matching (optional)
//   window   — "week" (default) | "month"
//   force    — "1" to bypass cache and refresh

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.trim().toUpperCase();

  // Allow tickers with dots (BRK.B) but block clearly invalid inputs
  if (!t || !/^[A-Z.]{1,7}$/.test(t)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  // ── 0. Feature flag ────────────────────────────────────────────────────────
  // Must be the first gate so disabling takes effect immediately,
  // even for cached responses.
  if (process.env.ENABLE_REDDIT_SOCIAL_PULSE !== "true") {
    return NextResponse.json(
      { status: "disabled", message: "Reddit Pulse is not enabled in this environment." },
      { status: 503 }
    );
  }

  const companyName = req.nextUrl.searchParams.get("company") ?? t;
  const timeWindow = (req.nextUrl.searchParams.get("window") ?? "week") as "week" | "month";
  const force = req.nextUrl.searchParams.get("force") === "1";

  const supabase = await createClient();

  // ── 1. Return fresh cached snapshot ────────────────────────────────────────
  if (!force) {
    const { data: cached } = await supabase
      .from("reddit_social_snapshots")
      .select("*")
      .eq("ticker", t)
      .eq("time_window", timeWindow)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return NextResponse.json(rowToPulseData(cached), {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }
  }

  // ── 2. Guard: credentials required ─────────────────────────────────────────
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
    return NextResponse.json(
      { status: "no_credentials", message: "Reddit API not configured." },
      { status: 503 }
    );
  }

  // ── 3. Fetch live Reddit data ───────────────────────────────────────────────
  const posts = await searchRedditPosts(t, companyName, { timeWindow });

  if (posts.length === 0) {
    // Try to surface stale cached data rather than returning nothing
    const { data: stale } = await supabase
      .from("reddit_social_snapshots")
      .select("*")
      .eq("ticker", t)
      .eq("time_window", timeWindow)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stale) {
      return NextResponse.json({ ...rowToPulseData(stale), stale: true });
    }

    return NextResponse.json(
      { status: "unavailable", message: "No Reddit discussion found for this ticker." },
      { status: 404 }
    );
  }

  // ── 4. Build pulse ──────────────────────────────────────────────────────────
  const pulse = await buildRedditPulse(t, companyName, posts, timeWindow, CACHE_TTL_MINUTES);

  // ── 5. Persist to Supabase ──────────────────────────────────────────────────
  const row = {
    ticker: t,
    company_name: companyName,
    time_window: timeWindow,
    fetched_at: pulse.fetched_at,
    expires_at: pulse.expires_at,
    post_count: pulse.post_count,
    mention_count: pulse.mention_count,
    bullish_pct: pulse.bullish_pct,
    bearish_pct: pulse.bearish_pct,
    neutral_pct: pulse.neutral_pct,
    sentiment_score: pulse.sentiment_score,
    hype_score: pulse.hype_score,
    conviction_score: pulse.conviction_score,
    reddit_pulse_score: pulse.reddit_pulse_score,
    top_themes_json: JSON.stringify(pulse.top_themes),
    top_bullish_themes_json: JSON.stringify(pulse.top_bullish_themes),
    top_bearish_themes_json: JSON.stringify(pulse.top_bearish_themes),
    top_risks_json: JSON.stringify(pulse.top_risks),
    top_catalysts_json: JSON.stringify(pulse.top_catalysts),
    subreddit_breakdown_json: JSON.stringify(pulse.subreddit_breakdown),
    source_post_links_json: JSON.stringify(pulse.source_post_links),
    summary: pulse.summary,
    ai_analysis_json: JSON.stringify({
      ai_powered: pulse.ai_powered,
      sentiment_label: pulse.sentiment_label,
    }),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("reddit_social_snapshots")
    .upsert(row, { onConflict: "ticker,time_window" });

  return NextResponse.json(pulse);
}

// ─── DB row → RedditPulseData ──────────────────────────────────────────────────

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function rowToPulseData(s: Record<string, unknown>): RedditPulseData {
  const aiMeta = parseJson<{ ai_powered?: boolean; sentiment_label?: string }>(
    s.ai_analysis_json,
    {}
  );

  return {
    ticker: String(s.ticker ?? ""),
    company_name: String(s.company_name ?? ""),
    time_window: String(s.time_window ?? "week") as "week" | "month",
    fetched_at: String(s.fetched_at ?? ""),
    expires_at: String(s.expires_at ?? ""),
    post_count: Number(s.post_count ?? 0),
    mention_count: Number(s.mention_count ?? 0),
    bullish_pct: Number(s.bullish_pct ?? 0),
    bearish_pct: Number(s.bearish_pct ?? 0),
    neutral_pct: Number(s.neutral_pct ?? 0),
    sentiment_score: Number(s.sentiment_score ?? 0),
    hype_score: Number(s.hype_score ?? 0),
    conviction_score: Number(s.conviction_score ?? 0),
    reddit_pulse_score: Number(s.reddit_pulse_score ?? 0),
    sentiment_label: String(aiMeta.sentiment_label ?? "Neutral"),
    top_themes: parseJson<string[]>(s.top_themes_json, []),
    top_bullish_themes: parseJson<string[]>(s.top_bullish_themes_json, []),
    top_bearish_themes: parseJson<string[]>(s.top_bearish_themes_json, []),
    top_risks: parseJson<string[]>(s.top_risks_json, []),
    top_catalysts: parseJson<string[]>(s.top_catalysts_json, []),
    subreddit_breakdown: parseJson(s.subreddit_breakdown_json, []),
    source_post_links: parseJson(s.source_post_links_json, []),
    summary: String(s.summary ?? ""),
    ai_powered: Boolean(aiMeta.ai_powered),
  };
}
