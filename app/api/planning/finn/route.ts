import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type FinnContext = {
  current_age: number | null;
  target_retirement_age: number | null;
  years_to_retire: number | null;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  monthly_income: number;
  monthly_expenses: number;
  monthly_savings: number;
  savings_rate_pct: number;
  portfolio_total_value: number;
  financial_health_score: number;
  health_factors: { name: string; score: number; max: number; direction: "strength" | "weakness" | "neutral" }[];
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini not configured." }, { status: 500 });

  let context: FinnContext;
  try {
    context = await req.json() as FinnContext;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    current_age, target_retirement_age, years_to_retire,
    total_assets, total_liabilities, net_worth,
    monthly_income, monthly_expenses, monthly_savings, savings_rate_pct,
    portfolio_total_value, financial_health_score, health_factors,
  } = context;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const factorLines = health_factors
    .map((f) => `  - ${f.name}: ${f.score}/${f.max} (${f.direction})`)
    .join("\n");

  const systemPrompt = `You are FINN, BuyTune's financial planning advisor.
Your role is to help users understand their financial future clearly and confidently.
You communicate probability, not false certainty.
You are empowering, not judgmental.
You focus on what matters most.
You use plain language. No jargon.
You never give specific tax advice or act as a licensed financial advisor.
Always end with: "For informational purposes only — not financial advice."`;

  const userPrompt = `Analyze this user's financial snapshot and provide 2-4 sentences of clear, actionable commentary.
Lead with the single most impactful insight. Be specific about numbers. Be encouraging but honest.

Financial Health Score: ${financial_health_score}/100
Age: ${current_age ?? "not set"} → Target retirement age: ${target_retirement_age ?? "not set"}${years_to_retire != null ? ` (${years_to_retire} years away)` : ""}

Balance Sheet:
  Total assets: ${fmt(total_assets)}
  Total liabilities: ${fmt(total_liabilities)}
  Net worth: ${fmt(net_worth)}
  Portfolio value (invested): ${fmt(portfolio_total_value)}

Cash Flow:
  Monthly income: ${fmt(monthly_income)}
  Monthly expenses: ${fmt(monthly_expenses)}
  Monthly savings: ${fmt(monthly_savings)}
  Savings rate: ${pct(savings_rate_pct)}

Health Score Breakdown:
${factorLines}

Respond in 2-4 plain sentences. No bullet points. No headers. End with the disclaimer.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Gemini error: ${err}` }, { status: 502 });
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return NextResponse.json({ commentary: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
