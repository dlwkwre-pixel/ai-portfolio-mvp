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
  // Goal planning context
  purchase_year?: number | null;
  years_until_purchase?: number | null;
  projected_income_at_purchase?: number | null;
  projected_cash_at_purchase?: number | null;
  cash_surplus_deficit?: number | null;
  future_dti?: number | null;
  emergency_months_after?: number | null;
  goal_probability?: number | null;
  on_track?: boolean | null;
  // Market intelligence context (optional)
  market_zip?: string | null;
  market_score?: number | null;
  market_score_label?: string | null;
  vacancy_rate?: number | null;
  rent_burden_pct?: number | null;
  homeownership_rate?: number | null;
  median_year_built?: number | null;
  suggested_maintenance_pct?: number | null;
  median_owner_costs?: number | null;
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
    purchase_year, years_until_purchase, projected_income_at_purchase,
    projected_cash_at_purchase, cash_surplus_deficit, future_dti,
    emergency_months_after, goal_probability, on_track,
    market_zip, market_score, market_score_label, vacancy_rate, rent_burden_pct,
    homeownership_rate, median_year_built, suggested_maintenance_pct, median_owner_costs,
  } = body;

  const downPct = purchase_price > 0 ? ((down_payment / purchase_price) * 100).toFixed(0) : "0";
  const monthlyDelta = monthly_ownership_cost - monthly_rent;
  const retirementLine = retirement_prob_baseline != null && retirement_prob_with_home != null
    ? `  Retirement probability: ${retirement_prob_baseline}% → ${retirement_prob_with_home}% with this purchase (${retirement_prob_with_home - retirement_prob_baseline > 0 ? "+" : ""}${retirement_prob_with_home - retirement_prob_baseline}pp)`
    : null;

  const marketLines = market_zip != null ? [
    `  ZIP: ${market_zip}${market_score != null ? ` · Market Score: ${market_score}/100 (${market_score_label ?? ""})` : ""}`,
    vacancy_rate != null ? `  Vacancy rate: ${vacancy_rate}%` : null,
    rent_burden_pct != null ? `  Rent burden: ${rent_burden_pct}% of income (median renter)` : null,
    homeownership_rate != null ? `  Homeownership rate: ${homeownership_rate}%` : null,
    median_year_built != null ? `  Median housing vintage: ${median_year_built}${suggested_maintenance_pct != null ? ` → suggested maintenance ${suggested_maintenance_pct}%/yr` : ""}` : null,
    median_owner_costs != null ? `  Typical local owner cost: ${fmt(median_owner_costs)}/mo (Census — includes utilities)` : null,
  ].filter(Boolean).join("\n") : null;

  const goalLines = purchase_year != null ? [
    `  Target purchase year: ${purchase_year} (${years_until_purchase ?? 0} years away)`,
    projected_cash_at_purchase != null
      ? `  Projected savings at purchase: ${fmt(projected_cash_at_purchase)} vs. ${fmt(down_payment)} needed for down payment`
      : null,
    cash_surplus_deficit != null
      ? `  Cash position: ${cash_surplus_deficit >= 0 ? "+" : ""}${fmt(cash_surplus_deficit)} vs. target`
      : null,
    projected_income_at_purchase != null
      ? `  Projected annual income at purchase year: ${fmt(projected_income_at_purchase)}`
      : null,
    future_dti != null ? `  Future housing DTI: ${future_dti.toFixed(0)}%` : null,
    emergency_months_after != null
      ? `  Emergency fund after purchase: ${emergency_months_after.toFixed(1)} months`
      : null,
    goal_probability != null
      ? `  Goal probability: ${goal_probability}% — ${on_track ? "On Track" : "At Risk"}`
      : null,
  ].filter(Boolean).join("\n") : null;

  const systemPrompt = `You are FINN, BuyTune's financial planning advisor.
You are not a mortgage calculator. You are a CFP-style advisor helping users understand if a home purchase fits their life plan.
You use the user's actual projected financials — not generic rules of thumb.
Be honest about tradeoffs, specific with numbers, and give actionable guidance.
Never guarantee investment returns or home appreciation. Never give legal or tax advice.`;

  const userPrompt = `Analyze this home purchase scenario. Write 4–5 sentences as a trusted financial advisor, not a readout. Lead with the user's goal readiness, not the mortgage math.

Scenario: ${scenario_name}
Property: ${fmt(purchase_price)}, ${fmt(down_payment)} down (${downPct}%), ${(mortgage_rate * 100).toFixed(2)}% rate, ${loan_term_years}yr.

Monthly: P&I ${fmt(monthly_payment)} · Total cost ${fmt(monthly_ownership_cost)} vs. rent ${fmt(monthly_rent)} (${monthlyDelta >= 0 ? "+" : ""}${fmt(monthlyDelta)}/mo difference)
True effective cost after equity: ${fmt(true_effective_cost)}/mo
Break-even: ${break_even_year != null ? `Year ${break_even_year}` : "Does not break even within hold period"}
Equity at year ${hold_years}: ${fmt(equity_at_hold)} (home value ${fmt(home_value_at_hold)})

User: age ${current_age ?? "unknown"}, ${years_to_retire ?? "unknown"} years to retirement
${retirementLine ?? ""}

${goalLines ? `Goal planning:\n${goalLines}` : ""}

${marketLines ? `Local market (ZIP ${market_zip}):\n${marketLines}` : ""}

Instructions: If goal data is available, lead with it specifically ("Based on your projected savings of $X by [year]..."). Cover: goal readiness and timeline; monthly cash flow impact; retirement tradeoff; biggest risk. If market data is present, weave in one sentence on what local conditions mean for this decision (don't just recite numbers — interpret them). Do not use bullet points. Synthesize — do not just list the numbers.

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
