import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type EducationFinnRequest = {
  scenario_name: string;
  child_name: string | null;
  child_current_age: number;
  years_until_college: number;
  years_in_college: number;
  annual_cost_today: number;
  cost_inflation_rate_pct: number;
  future_annual_cost: number;
  total_college_cost: number;
  current_529_balance: number;
  monthly_contribution: number;
  investment_return_pct: number;
  fv529: number;
  coverage_pct: number;
  monthly_needed: number;
  funding_gap: number;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: EducationFinnRequest;
  try {
    body = await req.json() as EducationFinnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    scenario_name, child_name, child_current_age, years_until_college, years_in_college,
    annual_cost_today, cost_inflation_rate_pct, future_annual_cost, total_college_cost,
    current_529_balance, monthly_contribution, investment_return_pct,
    fv529, coverage_pct, monthly_needed, funding_gap,
  } = body;

  const childLabel = child_name ? `${child_name} (age ${child_current_age})` : `age ${child_current_age}`;
  const isOnTrack = coverage_pct >= 100;
  const shortfallLabel = isOnTrack
    ? `no shortfall — projected to cover ${coverage_pct.toFixed(0)}% of costs`
    : `${fmt(funding_gap)} shortfall — ${coverage_pct.toFixed(0)}% coverage`;

  const systemPrompt = `You are Atlas, BuyTune's financial planning advisor specializing in education funding.
You provide clear, actionable guidance on 529 college savings plans and education cost planning.
Never give tax advice beyond noting the general tax advantages of 529 plans. End with the standard disclaimer.`;

  const userPrompt = `Analyze this college savings scenario and give 3–5 sentences of specific, actionable guidance.

Scenario: ${scenario_name}
Child: ${childLabel}
Time to college: ${years_until_college} years | Duration: ${years_in_college} years

Cost projection:
  Annual cost today: ${fmt(annual_cost_today)} (at ${cost_inflation_rate_pct.toFixed(1)}% education inflation)
  Future annual cost at enrollment: ${fmt(future_annual_cost)}
  Total projected college cost: ${fmt(total_college_cost)}

529 Savings:
  Current balance: ${fmt(current_529_balance)}
  Monthly contribution: ${fmt(monthly_contribution)}/mo at ${investment_return_pct.toFixed(1)}% return
  Projected value at college: ${fmt(fv529)}
  Coverage: ${shortfallLabel}
  ${!isOnTrack ? `Monthly needed to fully fund: ${fmt(monthly_needed)}/mo (${fmt(monthly_needed - monthly_contribution)}/mo increase needed)` : "On track — could reduce contributions or build a buffer"}

Focus on: (1) whether current contributions close the gap and by when, (2) the cost of waiting vs starting now, (3) realistic contribution increase to reach 100% coverage, (4) brief note on 529 tax advantages if underfunding. Be specific with numbers.

End with: "For informational purposes only — not financial advice."`;

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_FINN_COMMENTARY_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ commentary: text.trim() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI error" }, { status: 500 });
  }
}
