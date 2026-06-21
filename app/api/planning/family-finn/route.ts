import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type FamilyFinnRequest = {
  scenario_name: string;
  child_name: string | null;
  child_current_age: number;
  monthly_infant_cost: number;
  monthly_child_cost: number;
  monthly_teen_cost: number;
  monthly_expenses_now: number;
  current_monthly_impact: number;
  total_cost_to_18: number;
  investment_return_pct: number;
  // Retirement impact
  years_to_retirement: number | null;
  monthly_savings_before: number | null;
  monthly_savings_after: number | null;
  projected_nw_before: number | null;
  projected_nw_after: number | null;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: FamilyFinnRequest;
  try {
    body = await req.json() as FamilyFinnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    scenario_name, child_name, child_current_age,
    monthly_infant_cost, monthly_child_cost, monthly_teen_cost,
    monthly_expenses_now, current_monthly_impact, total_cost_to_18,
    investment_return_pct,
    years_to_retirement, monthly_savings_before, monthly_savings_after,
    projected_nw_before, projected_nw_after,
  } = body;

  const childLabel = child_name ? `${child_name} (age ${child_current_age})` : `age ${child_current_age}`;
  const costImpactPct = monthly_expenses_now > 0
    ? ((current_monthly_impact / monthly_expenses_now) * 100).toFixed(0)
    : "unknown";

  const retirementSection = years_to_retirement != null && monthly_savings_before != null && monthly_savings_after != null
    ? `Retirement impact (${years_to_retirement} yrs to retirement @ ${investment_return_pct.toFixed(1)}% return):
  Monthly savings before child: ${fmt(monthly_savings_before)}/mo → after: ${fmt(monthly_savings_after)}/mo
  Projected net worth at retirement: ${projected_nw_before != null ? fmt(projected_nw_before) : "unknown"} → ${projected_nw_after != null ? fmt(projected_nw_after) : "unknown"}`
    : null;

  const systemPrompt = `You are Atlas, BuyTune's financial planning advisor specializing in family financial planning.
You give honest, empathetic guidance on the financial realities of raising children.
Acknowledge both the costs and the joy — but stay grounded in the math. End with the standard disclaimer.`;

  const userPrompt = `Analyze this family planning scenario and give 3–5 sentences of specific, actionable guidance.

Scenario: ${scenario_name}
Child: ${childLabel}

Monthly cost breakdown by phase:
  Infant (0–2): ${fmt(monthly_infant_cost)}/mo
  Child (3–12): ${fmt(monthly_child_cost)}/mo
  Teen (13–17): ${fmt(monthly_teen_cost)}/mo

Current situation:
  Monthly household expenses now: ${fmt(monthly_expenses_now)}/mo
  Current monthly child impact: ${fmt(current_monthly_impact)}/mo (${costImpactPct}% of current expenses)
  Total estimated cost to age 18: ${fmt(total_cost_to_18)}

${retirementSection ?? "Retirement impact data not available."}

Focus on: (1) the realistic monthly budget impact at the current child age and what changes ahead, (2) how total cost compares to common benchmarks (~$300K average), (3) concrete steps to prepare the budget for the most expensive phases, (4) retirement savings impact and whether they can maintain contributions. Be specific with numbers.

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
