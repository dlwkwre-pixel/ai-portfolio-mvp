import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { runGrokDeepDive } from "@/lib/ai/grok-deep-dive";

// On-demand Grok deep-dive for a single stock — uses live web + X search like
// the portfolio analysis. Costs Grok tokens, so it's button-triggered and cached.
// Core logic lives in lib/ai/grok-deep-dive.ts, shared with the MCP
// run_deep_analysis tool (which has no browser session to check here).
export const maxDuration = 300;

// Cached-only read — never spends Grok tokens. Lets the UI offer "view last analysis"
// as an alternative to a fresh (paid) scan once the 12h freshness window has passed,
// instead of that older analysis just becoming silently unreachable.
export async function GET(req: NextRequest) {
  const { limited, retryAfter } = checkRateLimit(`grok-analysis-cached:${getIp(req)}`, 30, 10 * 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view AI analysis." }, { status: 401 });

    const ticker = req.nextUrl.searchParams.get("ticker");
    if (!ticker) return NextResponse.json({ error: "Ticker required." }, { status: 400 });

    const t = String(ticker).trim().toUpperCase();
    const cacheKey = `grok:${t}`;
    const supabase = await createClient();

    const { data: cached } = await supabase
      .from("stock_ai_analyses")
      .select("analysis_text, created_at")
      .eq("ticker", cacheKey)
      .maybeSingle();

    if (!cached?.analysis_text) {
      return NextResponse.json({ error: "No previous analysis for this stock yet." }, { status: 404 });
    }
    try {
      const parsed = JSON.parse(cached.analysis_text) as Record<string, unknown>;
      return NextResponse.json({ ...parsed, cached_at: cached.created_at });
    } catch {
      return NextResponse.json({ error: "No previous analysis for this stock yet." }, { status: 404 });
    }
  } catch (err) {
    console.error("[grok-analysis][GET] error:", err);
    return NextResponse.json({ error: "Failed to load previous analysis." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = checkRateLimit(`grok-analysis:${getIp(req)}`, 6, 10 * 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  try {
    // Grok live search costs real money per call — signed-in users only. The research
    // page already requires a session, so legitimate callers are unaffected; this just
    // closes the anonymous token-burn hole (IP rate limit alone still allowed ~860 paid
    // calls/day from a single address).
    let userId: string | null = null;
    {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return NextResponse.json({ error: "Sign in to run AI analysis." }, { status: 401 });
      userId = user.id;
    }
    const { ticker, company_name, price, change_pct } = await req.json().catch(() => ({})) as {
      ticker?: string; company_name?: string; price?: number; change_pct?: number;
    };
    if (!ticker) return NextResponse.json({ error: "Ticker required." }, { status: 400 });

    const result = await runGrokDeepDive(String(ticker), company_name, price, change_pct, userId);
    if (result.kind === "error") return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.payload);
  } catch (err) {
    console.error("[grok-analysis] error:", err);
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
