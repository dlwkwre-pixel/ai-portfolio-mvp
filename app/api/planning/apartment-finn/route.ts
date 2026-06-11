import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type ConcessionParseRequest = {
  concession_text: string;
  base_rent: number;
  lease_term_months: number;
};

export type ConcessionParseResponse = {
  monthly_savings: number;
  explanation: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: ConcessionParseRequest;
  try {
    body = await req.json() as ConcessionParseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { concession_text, base_rent, lease_term_months } = body;

  if (!concession_text?.trim()) {
    return NextResponse.json({ monthly_savings: 0, explanation: "No concession" } satisfies ConcessionParseResponse);
  }

  const prompt = `Parse this apartment rental concession and calculate the monthly savings.

Concession: "${concession_text}"
Base rent: $${base_rent}/month
Lease term: ${lease_term_months} months

Calculation rules:
- "N months free" or "N months off" → total_savings = N × ${base_rent}; monthly_savings = total_savings / ${lease_term_months}
- "$X off first/last month" → monthly_savings = X / ${lease_term_months}
- "X% off first month" → monthly_savings = (${base_rent} × X/100) / ${lease_term_months}
- "waived admin fee" or "waived application fee" → monthly_savings = fee / ${lease_term_months} (use 0 if fee unknown)
- "reduced/waived deposit" → monthly_savings = 0 (one-time, not monthly)
- Multiple concessions: add monthly savings together

Return ONLY valid JSON:
{"monthly_savings": <number, 2 decimal places>, "explanation": "<one sentence showing the math>"}`;

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_FINN_COMMENTARY_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a precise calculator. Return only valid JSON. No text outside the JSON object." },
        { role: "user", content: prompt },
      ],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as Partial<ConcessionParseResponse>;
    return NextResponse.json({
      monthly_savings: typeof parsed.monthly_savings === "number" ? Math.max(0, Math.round(parsed.monthly_savings * 100) / 100) : 0,
      explanation: parsed.explanation ?? "",
    } satisfies ConcessionParseResponse);
  } catch {
    return NextResponse.json({ monthly_savings: 0, explanation: "Could not parse concession." } satisfies ConcessionParseResponse);
  }
}
