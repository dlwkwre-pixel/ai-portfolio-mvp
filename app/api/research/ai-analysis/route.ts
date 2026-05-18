import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { getFinnhubInsiderTransactions } from "@/lib/market-data/finnhub";
import OpenAI from "openai";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SYSTEM_PROMPT = `You are a concise institutional financial analyst. Respond ONLY with valid JSON — no markdown, no code fences, no explanation outside the JSON.`;

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

Return this exact JSON shape:
{
  "bull_case": "<2-3 key bullish arguments, 1-2 sentences, cite specific fundamentals or catalysts>",
  "bear_case": "<2-3 key bearish arguments, 1-2 sentences, cite specific risks or headwinds>",
  "key_catalysts": "<near-term events or trends that could move the stock, 1-2 sentences>",
  "key_risks": "<main downside risks, 1-2 sentences, be specific>",
  "takeaway": "<one sentence summary for a long-term investor>",
  "confidence": "<Low or Medium or High>"
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

    // Check Supabase cache first
    const { data: cached } = await supabase
      .from("stock_ai_analyses")
      .select("analysis_text, created_at")
      .eq("ticker", t)
      .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString())
      .maybeSingle();

    if (cached?.analysis_text) {
      try {
        const parsed = JSON.parse(cached.analysis_text) as Record<string, string>;
        return NextResponse.json({ ...parsed, cached_at: cached.created_at });
      } catch {
        // Corrupted cache — fall through to regenerate
      }
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured." }, { status: 503 });
    }

    // Fetch insider data to enrich the prompt (fire and don't block on failure)
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
      // Non-fatal — proceed without insider data
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(t, company_name ?? t, price ?? 0, change_pct ?? 0, insiderSummary) },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI returned an unexpected response. Please try again." }, { status: 502 });
    }

    let analysis: Record<string, string>;
    try {
      analysis = JSON.parse(jsonMatch[0]) as Record<string, string>;
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response. Please try again." }, { status: 502 });
    }

    const now = new Date().toISOString();

    // Upsert into cache — fire and forget, failure doesn't affect response
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
