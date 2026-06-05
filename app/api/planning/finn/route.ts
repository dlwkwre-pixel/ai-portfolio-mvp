import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

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
  // Phase 2
  return_rate_pct?: number;
  inflation_rate_pct?: number;
  retirement_probability?: number | null;
  projected_nw_at_retirement?: number | null;
  future_events_count?: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, isFinite(n) ? n : 0));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let rawContext: FinnContext;
  try {
    rawContext = await req.json() as FinnContext;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Load authoritative identity fields from DB — prevents fabricated age/retirement targets
  const { data: profileRow } = await supabase
    .from("financial_profiles")
    .select("current_age, target_retirement_age")
    .eq("user_id", user.id)
    .maybeSingle();

  // Clamp financial values to sane bounds; use DB-loaded identity fields
  const current_age = profileRow?.current_age ?? rawContext.current_age;
  const target_retirement_age = profileRow?.target_retirement_age ?? rawContext.target_retirement_age;
  const years_to_retire = (current_age != null && target_retirement_age != null)
    ? Math.max(0, target_retirement_age - current_age)
    : rawContext.years_to_retire;

  const context = {
    ...rawContext,
    current_age,
    target_retirement_age,
    years_to_retire,
    total_assets:           clamp(rawContext.total_assets, 0, 1e10),
    total_liabilities:      clamp(rawContext.total_liabilities, 0, 1e10),
    net_worth:              clamp(rawContext.net_worth, -1e10, 1e10),
    monthly_income:         clamp(rawContext.monthly_income, 0, 1e7),
    monthly_expenses:       clamp(rawContext.monthly_expenses, 0, 1e7),
    monthly_savings:        clamp(rawContext.monthly_savings, -1e7, 1e7),
    savings_rate_pct:       clamp(rawContext.savings_rate_pct, -100, 100),
    portfolio_total_value:  clamp(rawContext.portfolio_total_value, 0, 1e10),
    financial_health_score: clamp(rawContext.financial_health_score, 0, 100),
    health_factors: (rawContext.health_factors ?? []).map((f) => ({
      ...f,
      score: clamp(f.score, 0, f.max),
    })),
  };

  const {
    monthly_income, monthly_expenses, monthly_savings, savings_rate_pct,
    total_assets, total_liabilities, net_worth,
    portfolio_total_value, financial_health_score, health_factors,
    return_rate_pct, inflation_rate_pct, retirement_probability,
    projected_nw_at_retirement, future_events_count,
  } = context;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const factorLines = health_factors
    .map((f) => `  - ${f.name}: ${f.score}/${f.max} (${f.direction})`)
    .join("\n");

  const phase2Lines = [
    return_rate_pct != null ? `  Assumed return rate: ${return_rate_pct.toFixed(1)}%` : null,
    inflation_rate_pct != null ? `  Assumed inflation: ${inflation_rate_pct.toFixed(1)}%` : null,
    retirement_probability != null ? `  Retirement on-track probability: ${retirement_probability}%` : null,
    projected_nw_at_retirement != null ? `  Projected net worth at retirement: ${fmt(projected_nw_at_retirement)}` : null,
    future_events_count != null && future_events_count > 0 ? `  Future events planned: ${future_events_count}` : null,
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are FINN, BuyTune's financial planning advisor.
Your role is to help users understand their financial future clearly and confidently.
You communicate probability, not false certainty.
You are empowering, not judgmental.
You focus on what matters most.
You use plain language. No jargon.
You never give specific tax advice or act as a licensed financial advisor.
Always end with: "For informational purposes only — not financial advice."`;

  const userPrompt = `Analyze this user's financial snapshot and provide 2-4 sentences of clear, actionable commentary.
Lead with the single most impactful insight. If a retirement probability is provided, lead with it. Be specific about numbers. Be encouraging but honest.

Financial Health Score: ${financial_health_score}/100
Age: ${current_age ?? "not set"} → Target retirement age: ${target_retirement_age ?? "not set"}${years_to_retire != null ? ` (${years_to_retire} years away)` : ""}

Balance Sheet:
  Total assets: ${fmt(total_assets)}
  Total liabilities: ${fmt(total_liabilities)}
  Net worth: ${fmt(net_worth)}
  Portfolio value (invested): ${fmt(portfolio_total_value)}

Cash Flow:
  Monthly net income: ${fmt(monthly_income)}
  Monthly expenses: ${fmt(monthly_expenses)}
  Monthly savings: ${fmt(monthly_savings)}
  Savings rate: ${pct(savings_rate_pct)}

Health Score Breakdown:
${factorLines}
${phase2Lines ? `\nForecast:\n${phase2Lines}` : ""}

Respond in 2-4 plain sentences. No bullet points. No headers. End with the disclaimer.`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const model = process.env.GROQ_FINN_COMMENTARY_MODEL ?? "llama-3.3-70b-versatile";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.4,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ commentary: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
