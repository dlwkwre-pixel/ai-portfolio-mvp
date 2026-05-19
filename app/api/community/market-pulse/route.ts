import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FALLBACK = "Markets are shaped by a constant interplay of fundamentals and sentiment. Diversification across sectors and asset classes reduces concentration risk over long horizons. Reviewing your strategy against your original thesis remains one of the highest-value activities an investor can do.";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: cached } = await supabase
    .from("market_pulse")
    .select("content")
    .eq("date", today)
    .maybeSingle();

  if (cached?.content) return NextResponse.json({ content: cached.content, date: today });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ content: FALLBACK, date: today });

  try {
    const prompt = `You are FINN, BuyTune's AI investment assistant. Write a market perspective for investors on ${today} in exactly 2 crisp sentences. First sentence: a broad macro or market theme relevant to today's environment. Second sentence: a practical, timeless investor mindset or risk discipline insight. Keep it factual, educational, and neutral. No specific stock picks or financial advice. No em-dashes. No bullet points.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 160 },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) return NextResponse.json({ content: FALLBACK, date: today });

    const json = await res.json();
    const content: string = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? FALLBACK;

    await supabase.from("market_pulse").insert({ date: today, content }).select().maybeSingle();

    return NextResponse.json({ content, date: today });
  } catch {
    return NextResponse.json({ content: FALLBACK, date: today });
  }
}
