import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type HomeFinnRequest = {
  // Scenario inputs
  scenario_name: string;
  purchase_price: number;
  down_payment: number;
  mortgage_rate: number;
  loan_term_years: number;
  monthly_ownership_cost: number;
  monthly_rent: number;
  hold_years: number;
  // Computed outputs
  monthly_payment: number;
  true_effective_cost: number;
  break_even_year: number | null;
  equity_at_hold: number;
  home_value_at_hold: number;
  // User profile context (optional)
  current_age: number | null;
  years_to_retire: number | null;
  net_worth: number | null;
  retirement_prob_baseline: number | null;
  retirement_prob_with_home: number | null;
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: HomeFinnRequest;
  try {
    body = await req.json() as HomeFinnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    scenario_name, purchase_price, down_payment, mortgage_rate, loan_term_years,
    monthly_ownership_cost, monthly_rent, hold_years,
    monthly_payment, true_effective_cost, break_even_year, equity_at_hold, home_value_at_hold,
    current_age, years_to_retire, net_worth,
    retirement_prob_baseline, retirement_prob_with_home,
  } = body;

  const downPct = purchase_price > 0 ? ((down_payment / purchase_price) * 100).toFixed(0) : "0";
  const monthlyDelta = monthly_ownership_cost - monthly_rent;
  const retirementLine = retirement_prob_baseline != null && retirement_prob_with_home != null
    ? `  Retirement probability: ${retirement_prob_baseline}% → ${retirement_prob_with_home}% with this purchase (${retirement_prob_with_home - retirement_prob_baseline > 0 ? "+" : ""}${retirement_prob_with_home - retirement_prob_baseline}pp)`
    : null;

  const systemPrompt = `You are FINN, BuyTune's financial planning advisor specializing in housing decisions.
You provide clear, balanced analysis of rent vs. buy decisions — not sales pitches.
You communicate tradeoffs honestly, acknowledge uncertainty, and help users think clearly.
You never guarantee home appreciation or investment returns.
Never give legal or licensed financial advice. End with the standard disclaimer.`;

  const userPrompt = `Analyze this home purchase scenario and provide 3–5 sentences of clear, actionable guidance.

Scenario: ${scenario_name}
Property: ${fmt(purchase_price)} purchase price, ${fmt(down_payment)} down (${downPct}%), ${mortgage_rate * 100}% rate, ${loan_term_years}-year mortgage.

Monthly costs:
  Mortgage P&I: ${fmt(monthly_payment)}/mo
  Total ownership cost (P&I + tax + insurance + HOA + maintenance): ${fmt(monthly_ownership_cost)}/mo
  Current rent alternative: ${fmt(monthly_rent)}/mo
  Monthly cost difference (own vs. rent): ${monthlyDelta >= 0 ? "+" : ""}${fmt(monthlyDelta)}/mo

Analysis:
  True effective ownership cost (after principal credit): ${fmt(true_effective_cost)}/mo
  Break-even vs. renting: ${break_even_year != null ? `Year ${break_even_year}` : "Does not break even within hold period"}
  Projected home equity at year ${hold_years}: ${fmt(equity_at_hold)} (${fmt(home_value_at_hold)} home value)

User context:
  Age: ${current_age ?? "unknown"}, years to retirement: ${years_to_retire ?? "unknown"}
  Current net worth: ${net_worth != null ? fmt(net_worth) : "unknown"}
${retirementLine ?? ""}

Focus on: (1) affordability and cash flow impact, (2) whether the break-even timing is favorable, (3) retirement impact if data is available, (4) key risks or considerations. Be specific with the numbers. Do not use bullet points.

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
