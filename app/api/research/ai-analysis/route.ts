import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { getFinnhubInsiderTransactions } from "@/lib/market-data/finnhub";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const SYSTEM_PROMPT = `You are a concise institutional equity analyst with deep fundamental and technical expertise. Respond ONLY with valid JSON — no markdown, no code fences, no explanation outside the JSON.`;

function buildPrompt(
  ticker: string,
  company: string,
  price: number,
  changePct: number,
  insiderSummary?: string,
): string {
  const insiderLine = insiderSummary
    ? `\nInsider activity (last 90 days, open-market only): ${insiderSummary}`
    : "";
  return `Analyze ${ticker} (${company}).
Current price: $${price.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today)${insiderLine}

Use your training data and web knowledge about this company's fundamentals, recent earnings, competitive position, and macro context.

Return this exact JSON shape:
{
  "verdict": "<BUY or HOLD or SELL>",
  "conviction": "<Low or Medium or High>",
  "price_target": "<your 12-month price target as a number, e.g. 215.00, or null if uncertain>",
  "timeframe": "12 months",
  "bull_case": "<2-3 key bullish arguments, 1-2 sentences, cite specific fundamentals or catalysts>",
  "bear_case": "<2-3 key bearish arguments, 1-2 sentences, cite specific risks or headwinds>",
  "key_catalysts": "<near-term events or trends that could move the stock, 1-2 sentences>",
  "key_risks": "<main downside risks, 1-2 sentences, be specific>",
  "takeaway": "<one sentence summary — state your directional view clearly>"
}`;
}

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = checkRateLimit(`ai-analysis:${getIp(req)}`, 5, 5 * 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const { ticker, company_name, price, change_pct } = await req.json() as {
      ticker?: string;
      company_name?: string;
      price?: number;
      change_pct?: number;
    };

    if (!ticker) {
      return NextResponse.json({ error: "Ticker required." }, { status: 400 });
    }

    const t = String(ticker).trim().toUpperCase();
    const supabase = await createClient();

    // Check Supabase cache
    const { data: cached } = await supabase
      .from("stock_ai_analyses")
      .select("analysis_text, created_at")
      .eq("ticker", t)
      .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString())
      .maybeSingle();

    if (cached?.analysis_text) {
      try {
        const parsed = JSON.parse(cached.analysis_text) as Record<string, unknown>;
        return NextResponse.json({ ...parsed, cached_at: cached.created_at });
      } catch {
        // Corrupted cache — fall through to regenerate
      }
    }

    // Enrich with insider data
    let insiderSummary: string | undefined;
    try {
      const insider = await getFinnhubInsiderTransactions(t);
      if (insider && insider.transactions.length > 0) {
        const buys = insider.transactions.filter((tx) => tx.transactionCode === "P");
        const sells = insider.transactions.filter((tx) => tx.transactionCode === "S");
        const parts: string[] = [];
        if (buys.length > 0) parts.push(`${buys.length} open-market purchase${buys.length > 1 ? "s" : ""}`);
        if (sells.length > 0) parts.push(`${sells.length} open-market sale${sells.length > 1 ? "s" : ""}`);
        insiderSummary = parts.join(", ") + ` (signal: ${insider.signal})`;
      }
    } catch {
      // Non-fatal
    }

    // Research uses Groq only (Gemini free keys are maxed). No Grok tokens.
    const prompt = `${SYSTEM_PROMPT}\n\n${buildPrompt(t, company_name ?? t, price ?? 0, change_pct ?? 0, insiderSummary)}`;
    const raw = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 1100, groqOnly: true });
    if (!raw) {
      return NextResponse.json({ error: "AI not configured." }, { status: 503 });
    }

    const analysis = extractJsonObject<Record<string, unknown>>(raw);
    if (!analysis) {
      console.error("[ai-analysis] unparseable AI response:", raw.slice(0, 200));
      return NextResponse.json({ error: "AI returned an unexpected response. Please try again." }, { status: 502 });
    }

    const now = new Date().toISOString();

    void supabase.from("stock_ai_analyses").upsert(
      { ticker: t, analysis_text: JSON.stringify(analysis), created_at: now },
      { onConflict: "ticker" }
    );

    return NextResponse.json({ ...analysis, cached_at: now });
  } catch (err) {
    console.error("[ai-analysis] error:", err);
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
