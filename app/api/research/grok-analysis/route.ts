import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { extractJsonObject } from "@/lib/ai/gemini";
import { logAiUsage } from "@/lib/ai/usage";
import OpenAI from "openai";

// On-demand Grok deep-dive for a single stock — uses live web + X search like
// the portfolio analysis. Costs Grok tokens, so it's button-triggered and cached.
export const maxDuration = 300;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const SYSTEM_PROMPT = `You are a sharp institutional equity analyst with live web and X (Twitter) search. Research the given stock using CURRENT information — recent news, earnings, price action, analyst moves, and real-time sentiment. Do NOT rely on stale training data for prices or events; search for them.

Respond with ONLY valid JSON — no markdown, no code fences, no text outside the JSON object:
{
  "verdict": "<BUY or HOLD or SELL>",
  "conviction": "<Low or Medium or High>",
  "price_target": "<12-month price target as a number, e.g. 215.00, or null>",
  "timeframe": "12 months",
  "bull_case": "<2-3 specific bullish arguments citing current fundamentals/catalysts>",
  "bear_case": "<2-3 specific bearish arguments citing current risks/headwinds>",
  "key_catalysts": "<near-term events/trends that could move the stock, with dates if known>",
  "key_risks": "<main downside risks, be specific>",
  "takeaway": "<one-sentence directional view stated plainly>"
}`;

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
    {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return NextResponse.json({ error: "Sign in to run AI analysis." }, { status: 401 });
    }
    const { ticker, company_name, price, change_pct } = await req.json().catch(() => ({})) as {
      ticker?: string; company_name?: string; price?: number; change_pct?: number;
    };
    if (!ticker) return NextResponse.json({ error: "Ticker required." }, { status: 400 });

    const t = String(ticker).trim().toUpperCase();
    const cacheKey = `grok:${t}`;
    const supabase = await createClient();

    // Serve a recent cached Grok analysis to avoid re-spending tokens
    const { data: cached } = await supabase
      .from("stock_ai_analyses")
      .select("analysis_text, created_at")
      .eq("ticker", cacheKey)
      .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString())
      .maybeSingle();
    if (cached?.analysis_text) {
      try {
        const parsed = JSON.parse(cached.analysis_text) as Record<string, unknown>;
        return NextResponse.json({ ...parsed, cached_at: cached.created_at });
      } catch { /* regenerate */ }
    }

    const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Grok not configured." }, { status: 503 });

    const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 290000 });

    const userPrompt = `Analyze ${t}${company_name ? ` (${company_name})` : ""}.${price != null ? ` Last price around $${Number(price).toFixed(2)}${change_pct != null ? ` (${change_pct >= 0 ? "+" : ""}${Number(change_pct).toFixed(2)}% today)` : ""}.` : ""}

Run 2-4 targeted live searches (recent news, latest analyst actions/price targets, and current X sentiment) before forming a view. Then return the JSON object exactly as specified.`;

    const response = await client.responses.create({
      model: "grok-4-fast",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "web_search" }, { type: "x_search" }],
    } as never) as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number }; output?: unknown[] };

    const raw = response.output_text?.trim();

    await logAiUsage({
      provider: "grok",
      model: "grok-4-fast",
      route: "grok-analysis",
      promptTokens: response.usage?.input_tokens ?? null,
      completionTokens: response.usage?.output_tokens ?? null,
      // The prompt asks for 2-4 live searches; count actual search calls when present.
      searchCount: Array.isArray(response.output)
        ? response.output.filter((o) => /search/.test(String((o as { type?: string })?.type ?? ""))).length
        : 3,
    });

    if (!raw) return NextResponse.json({ error: "Grok returned an empty response." }, { status: 502 });

    const analysis = extractJsonObject<Record<string, unknown>>(raw);
    if (!analysis) {
      console.error("[grok-analysis] unparseable:", raw.slice(0, 200));
      return NextResponse.json({ error: "Grok returned an unexpected response. Try again." }, { status: 502 });
    }

    const now = new Date().toISOString();
    void supabase.from("stock_ai_analyses").upsert(
      { ticker: cacheKey, analysis_text: JSON.stringify(analysis), created_at: now },
      { onConflict: "ticker" }
    );

    return NextResponse.json({ ...analysis, cached_at: now });
  } catch (err) {
    console.error("[grok-analysis] error:", err);
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
