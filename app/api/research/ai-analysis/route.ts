import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function buildPrompt(ticker: string, company: string, price: number, changePct: number): string {
  return `You are a concise financial analyst. Analyze ${ticker} (${company}).
Current price: $${price.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today)

Respond ONLY with a valid JSON object — no markdown, no extra text:
{
  "bull_case": "2-3 key bullish arguments in 1-2 sentences",
  "bear_case": "2-3 key bearish arguments in 1-2 sentences",
  "key_catalysts": "Near-term events or trends to watch in 1-2 sentences",
  "key_risks": "Main downside risks in 1-2 sentences",
  "takeaway": "One-sentence summary for a typical long-term investor",
  "confidence": "Low or Medium or High"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, company_name, price, change_pct } = await req.json();

    if (!ticker) {
      return NextResponse.json({ error: "Ticker required" }, { status: 400 });
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
        const parsed = JSON.parse(cached.analysis_text);
        return NextResponse.json({ ...parsed, cached_at: cached.created_at });
      } catch {
        // Corrupted cache — fall through to regenerate
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured." }, { status: 503 });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: buildPrompt(t, company_name ?? t, price ?? 0, change_pct ?? 0) }],
          }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
        }),
      }
    );

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        return NextResponse.json(
          { error: "AI is busy right now. Please try again in a moment." },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "AI request failed." }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI returned an unexpected response." }, { status: 502 });
    }

    let analysis: Record<string, string>;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response." }, { status: 502 });
    }

    const now = new Date().toISOString();

    // Upsert into cache (one row per ticker, replace on conflict)
    await supabase.from("stock_ai_analyses").upsert(
      { ticker: t, analysis_text: JSON.stringify(analysis), created_at: now },
      { onConflict: "ticker" }
    );

    return NextResponse.json({ ...analysis, cached_at: now });
  } catch (err) {
    console.error("AI analysis error:", err);
    return NextResponse.json({ error: "Analysis failed." }, { status: 500 });
  }
}
