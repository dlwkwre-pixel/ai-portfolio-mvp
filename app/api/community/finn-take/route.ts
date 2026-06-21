import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";
import { checkRateLimit } from "@/lib/rate-limit";

// Generates a short, neutral Atlas take on a ticker that a user can attach to a
// community post. Educational framing only — never advice.
// Uses Groq (groqOnly) — Gemini's free tier is too tight for a social feature.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`finn-take:${user.id}`, 15, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many Atlas takes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  let ticker = "";
  try {
    const body = await req.json();
    ticker = String(body.ticker ?? "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 6);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!ticker) return NextResponse.json({ error: "A ticker is required." }, { status: 400 });

  const prompt = `You are Atlas, BuyTune's investing assistant. In 2 sentences max (under 280 characters), give a balanced, neutral take on the stock ticker ${ticker}: what it is and one bull point and one risk. Plain language, no hype, no price targets, no buy/sell advice. Do not start with "As Atlas". Just the take.`;

  const text = await callGemini(prompt, { temperature: 0.5, maxOutputTokens: 160, groqOnly: true });
  if (!text) {
    return NextResponse.json({ error: "Atlas is unavailable right now. Try again in a moment." }, { status: 503 });
  }

  const take = text.trim().replace(/^["']|["']$/g, "").slice(0, 600);
  return NextResponse.json({ ticker, take });
}
