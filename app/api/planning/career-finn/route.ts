import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type CareerFinnRequest = {
  scenario_name: string;
  current_monthly_income: number;
  current_growth_rate_pct: number;
  new_monthly_income: number;
  new_growth_rate_pct: number;
  gap_months: number;
  transition_cost: number;
  monthly_expenses: number;
  liquid_assets: number;
  projection_years: number;
  // Computed
  break_even_year: number | null;
  max_transition_cost: number;
  income_at_year10_current: number;
  income_at_year10_new: number;
  income_at_year20_current: number;
  income_at_year20_new: number;
  emergency_fund_runway_months: number;
  gap_deficit: number;
  retirement_prob_current: number | null;
  retirement_prob_new: number | null;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: CareerFinnRequest;
  try {
    body = await req.json() as CareerFinnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    scenario_name, current_monthly_income, current_growth_rate_pct,
    new_monthly_income, new_growth_rate_pct, gap_months, transition_cost,
    monthly_expenses, liquid_assets, projection_years,
    break_even_year, max_transition_cost, income_at_year10_current,
    income_at_year10_new, income_at_year20_current, income_at_year20_new,
    emergency_fund_runway_months, gap_deficit, retirement_prob_current, retirement_prob_new,
  } = body;

  const incomeDeltaYear1 = new_monthly_income - current_monthly_income;
  const incomePremiumYear20 = income_at_year20_new - income_at_year20_current;
  const hasFundingGap = gap_deficit > 0;
  const retirementLine = retirement_prob_current != null && retirement_prob_new != null
    ? `  Retirement probability: ${retirement_prob_current}% → ${retirement_prob_new}% (${retirement_prob_new - retirement_prob_current > 0 ? "+" : ""}${retirement_prob_new - retirement_prob_current}pp)`
    : null;

  const systemPrompt = `You are Atlas, BuyTune's financial planning advisor specializing in career decisions.
You provide clear, honest analysis of career change tradeoffs — not motivational coaching.
Focus on the financial math. Acknowledge both the costs and the long-term upside.
Never give legal or employment advice. End with the standard disclaimer.`;

  const userPrompt = `Analyze this career change scenario and give 3–5 sentences of specific, actionable guidance.

Scenario: ${scenario_name}

Current path: ${fmt(current_monthly_income)}/mo today, growing at ${current_growth_rate_pct}%/yr
New path: ${fmt(new_monthly_income)}/mo year 1, growing at ${new_growth_rate_pct}%/yr
Transition: ${gap_months > 0 ? `${gap_months}-month income gap` : "no income gap"}${transition_cost > 0 ? `, ${fmt(transition_cost)} one-time cost` : ""}

Year 1 income change: ${incomeDeltaYear1 >= 0 ? "+" : ""}${fmt(incomeDeltaYear1)}/mo vs current
Year 10: current ${fmt(income_at_year10_current)}/yr vs new ${fmt(income_at_year10_new)}/yr
Year 20: current ${fmt(income_at_year20_current)}/yr vs new ${fmt(income_at_year20_new)}/yr (${incomePremiumYear20 >= 0 ? "+" : ""}${fmt(incomePremiumYear20)} premium)

Break-even: ${break_even_year != null ? `Cumulative earnings match at year ${break_even_year}` : `Does not break even within ${projection_years} years`}
Maximum financial cost of transition: ${fmt(max_transition_cost)}

Monthly expenses: ${fmt(monthly_expenses)}/mo | Liquid savings: ${fmt(liquid_assets)}
Emergency fund runway: ${emergency_fund_runway_months.toFixed(1)} months
${hasFundingGap ? `Gap funding shortfall: ${fmt(gap_deficit)} — liquid savings are insufficient to cover ${gap_months} months at current expenses` : "Savings are sufficient to cover the income gap."}
${retirementLine ?? ""}

Focus on: (1) whether the long-term income premium justifies the short-term pain, (2) break-even timing in context, (3) emergency fund adequacy${gap_months > 0 ? " and the gap risk" : ""}, (4) retirement impact if shown. Be specific with numbers.

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
