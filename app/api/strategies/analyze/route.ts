import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import OpenAI from "openai";

export type StrategyFactor = {
  name: string;
  score: number;
  explanation: string;
};

export type StrategyAnalysis = {
  factors: StrategyFactor[];
  finn_confidence: number;
  thesis: string;
  weaknesses: string[];
  failure_conditions: string[];
  bull_case: string[];
  bear_case: string[];
};

type AnalyzeRequest = {
  name: string;
  style: string | null;
  risk_level: string | null;
  turnover_preference: string | null;
  holding_period_bias: string | null;
  max_position_pct: number | null;
  min_position_pct: number | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  prompt_text: string | null;
  description: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`strategies-analyze:${user.id}`, 12, 5 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let strategy: AnalyzeRequest;
  try {
    strategy = await req.json() as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    name, style, risk_level, turnover_preference, holding_period_bias,
    max_position_pct, min_position_pct, cash_min_pct, cash_max_pct,
    prompt_text, description,
  } = strategy;

  const systemPrompt = `You are FINN, an institutional-grade investment strategy analyst. You evaluate investment strategies with the rigor of a professional portfolio analyst — honest, specific, and data-grounded. You never produce vague compliments or generic AI filler. You identify real weaknesses and realistic failure conditions.

Respond ONLY with valid JSON. No markdown, no code fences, no explanation — just raw JSON.`;

  const userPrompt = `Analyze this investment strategy and return a JSON object with the exact shape below.

Strategy:
- Name: ${name}
- Style: ${style ?? "Not specified"}
- Risk Level: ${risk_level ?? "Not specified"}
- Trading Frequency / Turnover: ${turnover_preference ?? "Not specified"}
- Time Horizon / Holding Bias: ${holding_period_bias ?? "Not specified"}
- Max Single Position: ${max_position_pct != null ? `${max_position_pct}%` : "Not specified"}
- Min Single Position: ${min_position_pct != null ? `${min_position_pct}%` : "Not specified"}
- Cash Range: ${cash_min_pct != null && cash_max_pct != null ? `${cash_min_pct}%–${cash_max_pct}%` : "Not specified"}
- Description: ${description ?? "None provided"}
- AI Investment Instructions: ${prompt_text ?? "None provided"}

Required JSON shape:
{
  "factors": [
    { "name": "Risk Alignment", "score": <0-100>, "explanation": "<1 sentence why — cite specific parameters>" },
    { "name": "Diversification", "score": <0-100>, "explanation": "<1 sentence>" },
    { "name": "Tax Efficiency", "score": <0-100>, "explanation": "<1 sentence>" },
    { "name": "Drawdown Resilience", "score": <0-100>, "explanation": "<1 sentence>" },
    { "name": "Long-Term Compounding", "score": <0-100>, "explanation": "<1 sentence>" },
    { "name": "Emotional Durability", "score": <0-100>, "explanation": "<1 sentence>" },
    { "name": "Concentration Risk", "score": <0-100>, "explanation": "<1 sentence — high concentration = lower score>" },
    { "name": "Volatility Management", "score": <0-100>, "explanation": "<1 sentence>" }
  ],
  "finn_confidence": <0-100 overall confidence in strategy quality>,
  "thesis": "<3-4 sentence institutional investment rationale — explain WHY this strategy exists, what market conditions it exploits, what tradeoffs it makes, and how the specific parameters support the objective. Reference the actual parameters. No fluff.>",
  "weaknesses": [
    "<specific weakness 1 — cite numbers or conditions>",
    "<specific weakness 2>",
    "<specific weakness 3>"
  ],
  "failure_conditions": [
    "<specific condition that would materially hurt this strategy>",
    "<specific condition 2>",
    "<specific condition 3>"
  ],
  "bull_case": [
    "<specific bull argument for this strategy — cite parameters or market conditions>",
    "<bull argument 2>",
    "<bull argument 3>"
  ],
  "bear_case": [
    "<specific bear argument or risk — cite actual parameters or structural weakness>",
    "<bear argument 2>",
    "<bear argument 3>"
  ]
}

Rules:
- Be honest. If a strategy has real weaknesses, name them directly.
- Explanation fields must reference the actual parameters, not generic statements.
- finn_confidence should reflect genuine assessment: a poorly diversified aggressive strategy should score 55-70, not 88.
- Scores must vary meaningfully across factors — don't cluster everything at 70-80.
- Weaknesses and failure_conditions must be specific to THIS strategy's parameters, not generic investment advice.`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1900,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

    let analysis: StrategyAnalysis;
    try {
      analysis = JSON.parse(raw) as StrategyAnalysis;
      // Validate and clamp scores
      analysis.factors = (analysis.factors ?? []).map((f) => ({
        name: String(f.name),
        score: Math.min(100, Math.max(0, Math.round(Number(f.score) || 0))),
        explanation: String(f.explanation ?? ""),
      }));
      analysis.finn_confidence = Math.min(100, Math.max(0, Math.round(Number(analysis.finn_confidence) || 0)));
      analysis.thesis = String(analysis.thesis ?? "");
      analysis.weaknesses = (Array.isArray(analysis.weaknesses) ? analysis.weaknesses : []).map(String);
      analysis.failure_conditions = (Array.isArray(analysis.failure_conditions) ? analysis.failure_conditions : []).map(String);
      analysis.bull_case = (Array.isArray(analysis.bull_case) ? analysis.bull_case : []).map(String);
      analysis.bear_case = (Array.isArray(analysis.bear_case) ? analysis.bear_case : []).map(String);
    } catch {
      return NextResponse.json({ error: "AI returned unparseable output. Please try again." }, { status: 422 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
