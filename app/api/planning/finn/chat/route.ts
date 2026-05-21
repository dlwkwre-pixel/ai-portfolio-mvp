import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FinnChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FinnChatContext = {
  current_age: number | null;
  target_retirement_age: number | null;
  years_to_retire: number | null;
  risk_tolerance: string | null;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  portfolio_value: number;
  liquid_assets: number;
  monthly_net_income: number;
  monthly_expenses: number;
  monthly_savings: number;
  savings_rate_pct: number;
  asset_items: { label: string; category: string; value: number }[];
  liability_items: { label: string; value: number }[];
  income_items: { label: string; amount: number; frequency: string }[];
  expense_items: { label: string; amount: number; frequency: string }[];
  return_rate_pct: number;
  inflation_rate_pct: number;
  salary_growth_rate_pct: number;
  projected_nw_at_retirement: number | null;
  retirement_probability: number | null;
  financial_health_score: number;
  health_factors: { name: string; score: number; max: number; direction: string }[];
  future_events: { label: string; event_year: number; amount_impact: number; category: string }[];
  home_scenarios?: {
    name: string;
    purchase_price: number;
    monthly_payment: number;
    total_monthly: number;
    monthly_rent: number;
    break_even_year: number | null;
    equity_at_hold: number;
    hold_years: number;
    down_payment: number;
    mortgage_rate_pct: number;
  }[];
  career_scenarios?: {
    name: string;
    current_monthly: number;
    new_monthly: number;
    gap_months: number;
    break_even_year: number | null;
    income_at_year10_delta: number;
    retirement_prob_current: number | null;
    retirement_prob_new: number | null;
  }[];
  education_scenarios?: {
    name: string;
    child_name: string | null;
    child_current_age: number;
    years_until_college: number;
    total_college_cost: number;
    fv529: number;
    coverage_pct: number;
    funding_gap: number;
    monthly_needed: number;
    monthly_contribution: number;
  }[];
  family_scenarios?: {
    name: string;
    child_name: string | null;
    child_current_age: number;
    current_monthly_impact: number;
    total_cost_to_18: number;
    monthly_expenses_now: number;
  }[];
  partner_name?: string | null;
  partner_age?: number | null;
  partner_target_retirement_age?: number | null;
};

// ── Rate limiting ─────────────────────────────────────────────────────────────

type RateEntry = { count: number; windowStart: number; lastAt: number };
const rateMap = new Map<string, RateEntry>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const MIN_INTERVAL_MS = 1500;

function checkRateLimit(userId: string): string | null {
  const now = Date.now();
  const entry = rateMap.get(userId);
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) {
      if (now - v.windowStart > WINDOW_MS * 2) rateMap.delete(k);
    }
  }
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rateMap.set(userId, { count: 1, windowStart: now, lastAt: now });
    return null;
  }
  if (now - entry.lastAt < MIN_INTERVAL_MS) return "Please wait a moment before sending another message.";
  if (entry.count >= MAX_PER_WINDOW) {
    const resetMins = Math.ceil((entry.windowStart + WINDOW_MS - now) / 60000);
    return `Rate limit reached. Try again in ${resetMins} minute(s).`;
  }
  entry.count++;
  entry.lastAt = now;
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimitMsg = checkRateLimit(user.id);
  if (rateLimitMsg) return NextResponse.json({ error: rateLimitMsg }, { status: 429 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let messages: FinnChatMessage[];
  let context: FinnChatContext;
  try {
    const body = await req.json();
    messages = (body.messages as FinnChatMessage[]).slice(-20);
    context = body.context as FinnChatContext;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const pct = (n: number) => n.toFixed(1) + "%";

  const assetLines = [
    context.portfolio_value > 0 ? `  - Portfolio (BuyTune): ${fmt(context.portfolio_value)}` : null,
    ...context.asset_items.map((a) => `  - ${a.label} (${a.category}): ${fmt(a.value)}`),
  ].filter(Boolean).join("\n") || "  (none added)";

  const liabilityLines = context.liability_items.map((l) => `  - ${l.label}: ${fmt(l.value)}`).join("\n") || "  (none)";
  const incomeLines = context.income_items.map((i) => `  - ${i.label}: ${fmt(i.amount)}/${i.frequency}`).join("\n") || "  (none added)";
  const expenseLines = context.expense_items.map((e) => `  - ${e.label}: ${fmt(e.amount)}/${e.frequency}`).join("\n") || "  (none added)";
  const factorLines = context.health_factors.map((f) => `  - ${f.name}: ${f.score}/${f.max} (${f.direction})`).join("\n");
  const eventLines = context.future_events.length > 0
    ? context.future_events.map((e) => `  - ${e.label} (${e.event_year}): ${e.amount_impact >= 0 ? "+" : ""}${fmt(e.amount_impact)}`).join("\n")
    : null;

  const homeLines = context.home_scenarios && context.home_scenarios.length > 0
    ? context.home_scenarios.map((s) => {
        const delta = s.total_monthly - s.monthly_rent;
        return `  - "${s.name}": ${fmt(s.purchase_price)} @ ${s.mortgage_rate_pct.toFixed(2)}%, ${fmt(s.down_payment)} down — ${fmt(s.total_monthly)}/mo total vs ${fmt(s.monthly_rent)}/mo rent (${delta >= 0 ? "+" : ""}${fmt(delta)}/mo vs renting), break-even yr ${s.break_even_year ?? "N/A"}, equity ${fmt(s.equity_at_hold)} at yr ${s.hold_years}`;
      }).join("\n")
    : null;

  const careerLines = context.career_scenarios && context.career_scenarios.length > 0
    ? context.career_scenarios.map((s) => {
        const delta = s.new_monthly - s.current_monthly;
        return `  - "${s.name}": ${fmt(s.current_monthly)}/mo → ${fmt(s.new_monthly)}/mo (${delta >= 0 ? "+" : ""}${fmt(delta)}/mo yr1)${s.gap_months > 0 ? `, ${s.gap_months}-mo income gap` : ""}, break-even yr ${s.break_even_year ?? "N/A"}, yr10 income delta ${s.income_at_year10_delta >= 0 ? "+" : ""}${fmt(s.income_at_year10_delta)}${s.retirement_prob_current != null && s.retirement_prob_new != null ? `, retirement probability ${s.retirement_prob_current}% → ${s.retirement_prob_new}%` : ""}`;
      }).join("\n")
    : null;

  const educationLines = context.education_scenarios && context.education_scenarios.length > 0
    ? context.education_scenarios.map((s) => {
        const childLabel = s.child_name ? `${s.child_name} (age ${s.child_current_age})` : `age ${s.child_current_age}`;
        return `  - "${s.name}" [${childLabel}, ${s.years_until_college} yrs to college]: total cost ${fmt(s.total_college_cost)}, projected 529 ${fmt(s.fv529)}, coverage ${s.coverage_pct}%${s.funding_gap > 0 ? `, gap ${fmt(s.funding_gap)} (need ${fmt(s.monthly_needed)}/mo vs current ${fmt(s.monthly_contribution)}/mo)` : " — fully funded"}`;
      }).join("\n")
    : null;

  const familyLines = context.family_scenarios && context.family_scenarios.length > 0
    ? context.family_scenarios.map((s) => {
        const childLabel = s.child_name ? `${s.child_name} (age ${s.child_current_age})` : `age ${s.child_current_age}`;
        const pct = s.monthly_expenses_now > 0 ? ((s.current_monthly_impact / s.monthly_expenses_now) * 100).toFixed(0) : "?";
        return `  - "${s.name}" [${childLabel}]: ${fmt(s.current_monthly_impact)}/mo current cost (${pct}% of ${fmt(s.monthly_expenses_now)}/mo expenses), total cost to 18 ${fmt(s.total_cost_to_18)}`;
      }).join("\n")
    : null;

  const systemPrompt = `You are FINN, BuyTune's personal financial planning AI. You have complete access to this user's financial data shown below.

CAPABILITIES:
- Answer any question about their finances with specific numbers from their data
- Run what-if calculations and show your work ("If you save $X/mo more, your probability goes from Y% to Z%")
- Explain what their forecast and retirement probability mean in plain terms
- Scenario planning: different retirement ages, savings rates, market returns
- Stress testing: estimate impact of market crashes (-20%, -30%, -40%), job loss, major expenses
- Proactive alerts: flag risks and gaps they may not have noticed
- Optimization: give the single highest-leverage action they could take right now
- Estate/insurance gaps: mention relevant considerations informally (never recommend specific products)

COMMUNICATION RULES:
- Always cite specific numbers from their data — never speak in generalities
- Show calculations for what-if questions (one step at a time)
- Be direct and honest about risks — not just cheerful
- Keep responses concise: 3–5 sentences for simple questions, more only for complex math
- Never give specific tax advice or act as a licensed financial advisor
- End substantive advice with: "For informational purposes only — not financial advice."

USER'S COMPLETE FINANCIAL PICTURE:

Profile: Age ${context.current_age ?? "not set"} | Retirement target: ${context.target_retirement_age ?? "not set"}${context.years_to_retire != null ? ` (${context.years_to_retire} yrs away)` : ""} | Risk tolerance: ${context.risk_tolerance ?? "moderate"}${context.partner_name ? `\nHousehold: Joint planning — partner ${context.partner_name}${context.partner_age != null ? ` (age ${context.partner_age})` : ""}${context.partner_target_retirement_age != null ? `, retire at ${context.partner_target_retirement_age}` : ""}. Reference both people when discussing retirement timelines and household cashflow.` : ""}

NET WORTH: ${fmt(context.net_worth)}
  Total assets: ${fmt(context.total_assets)} | Total liabilities: ${fmt(context.total_liabilities)}
  Liquid/cash: ${fmt(context.liquid_assets)} | Invested portfolio: ${fmt(context.portfolio_value)}

ASSETS:
${assetLines}

LIABILITIES:
${liabilityLines}

MONTHLY CASH FLOW:
  Net income: ${fmt(context.monthly_net_income)} | Expenses: ${fmt(context.monthly_expenses)}
  Monthly savings: ${fmt(context.monthly_savings)} | Savings rate: ${pct(context.savings_rate_pct)}

Income sources:
${incomeLines}

Expenses:
${expenseLines}

FORECAST (${pct(context.return_rate_pct)} return · ${pct(context.inflation_rate_pct)} inflation · ${pct(context.salary_growth_rate_pct)} income growth):
  Projected net worth at retirement: ${context.projected_nw_at_retirement != null ? fmt(context.projected_nw_at_retirement) : "unknown"}
  On-track probability: ${context.retirement_probability != null ? context.retirement_probability + "%" : "unknown"} (4% rule — needs 25× projected annual expenses at retirement)

FINANCIAL HEALTH SCORE: ${context.financial_health_score}/100
${factorLines}
${eventLines ? `\nFUTURE EVENTS PLANNED:\n${eventLines}` : ""}
${homeLines ? `\nHOME PLANNING SCENARIOS:\n${homeLines}` : ""}
${careerLines ? `\nCAREER CHANGE SCENARIOS:\n${careerLines}` : ""}
${educationLines ? `\nEDUCATION / 529 SCENARIOS:\n${educationLines}` : ""}
${familyLines ? `\nFAMILY PLANNING SCENARIOS:\n${familyLines}` : ""}

KEY BENCHMARKS (use these in calculations):
  Emergency fund target: ${fmt(context.monthly_expenses * 3)}–${fmt(context.monthly_expenses * 6)} (3–6 months expenses)
  Retirement target (4% rule): 25× projected annual expenses
  FV formula: FV = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r  (r = monthly rate, n = months)
  Savings rate heuristic: each +5% savings rate ≈ +6–10 pp improvement in retirement probability`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const model = process.env.GROQ_FINN_CHAT_MODEL ?? "llama-3.3-70b-versatile";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 650,
      temperature: 0.5,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ response: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
