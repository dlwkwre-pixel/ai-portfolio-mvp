import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";

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

  try {
    const prompt = `You are FINN, BuyTune's AI investment assistant. Write a market perspective for investors on ${today} in exactly 2 crisp sentences. First sentence: a broad macro or market theme relevant to today's environment. Second sentence: a practical, timeless investor mindset or risk discipline insight. Keep it factual, educational, and neutral. No specific stock picks or financial advice. No em-dashes. No bullet points.`;

    const text = await callGemini(prompt, { temperature: 0.75, maxOutputTokens: 160 });
    const content = text?.trim() ?? FALLBACK;

    await supabase.from("market_pulse").insert({ date: today, content }).select().maybeSingle();

    return NextResponse.json({ content, date: today });
  } catch {
    return NextResponse.json({ content: FALLBACK, date: today });
  }
}
