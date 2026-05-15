import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type ImprovementChange = {
  field: string;
  label: string;
  from: string;
  to: string;
  reason: string;
};

export type ScoreDelta = {
  factor: string;
  before: number;
  after: number;
};

export type ImprovedParams = {
  turnover_preference?: string;
  holding_period_bias?: string;
  max_position_pct?: number | null;
  min_position_pct?: number | null;
  cash_min_pct?: number | null;
  cash_max_pct?: number | null;
  prompt_text?: string;
};

export type ImprovementResult = {
  mode: string;
  changes: ImprovementChange[];
  score_deltas: ScoreDelta[];
  projected_confidence: number;
  narrative: string;
  tradeoffs: string[];
  improved_params: ImprovedParams;
};

type ImproveRequest = {
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
  current_factors: { name: string; score: number }[];
  current_confidence: number;
  mode: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: ImproveRequest;
  try {
    body = await req.json() as ImproveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    name, style, risk_level, turnover_preference, holding_period_bias,
    max_position_pct, min_position_pct, cash_min_pct, cash_max_pct,
    prompt_text, description, current_factors, current_confidence, mode,
  } = body;

  const factorLines = (current_factors ?? [])
    .map((f) => `  - ${f.name}: ${f.score}/100`)
    .join("\n");

  const systemPrompt = `You are FINN, an institutional investment strategy optimizer. You improve investment strategies by making concrete, targeted parameter changes. You are analytically honest — improvements in one dimension come with real tradeoffs in others. You never claim to improve everything simultaneously.

Respond ONLY with valid JSON. No markdown, no code fences, no explanation outside the JSON structure.`;

  const modeGoals: Record<string, string> = {
    "Growth": "Maximize long-term capital appreciation. Accept more volatility and concentration for higher return potential. Bias toward higher-growth style parameters.",
    "Safety": "Reduce downside risk. Increase diversification, lower concentration limits, increase cash floor, lengthen holding periods to reduce reactive trading.",
    "Taxes": "Minimize tax drag. Reduce turnover to defer capital gains, extend holding periods toward long-term treatment, increase cash buffer to avoid forced selling.",
    "Income": "Increase income generation. Bias toward lower turnover (hold income-generating positions), increase cash floor for dividend reinvestment, moderate position sizing.",
    "Retirement": "Optimize for long-term retirement accumulation. Increase time horizon, reduce turnover, moderate concentration, focus on durable compounders over speculative exposure.",
    "Simplicity": "Reduce operational complexity. Lower turnover to fewer decisions, widen position sizing bands, reduce the number of active parameters, minimize rebalancing frequency.",
    "Downside Protection": "Strengthen drawdown resilience. Increase cash floor significantly, tighten max position size, reduce turnover to avoid whipsawing, lengthen holding horizon to ride out volatility.",
    "Diversification": "Reduce concentration risk. Lower max single position meaningfully, raise minimum position size slightly, reduce cash ceiling so cash doesn't crowd out diversified exposure.",
  };

  const goal = modeGoals[mode] ?? `Improve the strategy for ${mode}.`;

  const userPrompt = `Improve this strategy for the goal: "${mode}"

Strategy Parameters:
- Name: ${name}
- Style: ${style ?? "Not specified"}
- Risk Level: ${risk_level ?? "Not specified"}
- Turnover Preference: ${turnover_preference ?? "Not specified"}
- Holding Period Bias: ${holding_period_bias ?? "Not specified"}
- Max Single Position: ${max_position_pct != null ? `${max_position_pct}%` : "Not specified"}
- Min Single Position: ${min_position_pct != null ? `${min_position_pct}%` : "Not specified"}
- Cash Range: ${cash_min_pct != null ? `${cash_min_pct}%` : "?"}–${cash_max_pct != null ? `${cash_max_pct}%` : "?"}
- Description: ${description ?? "None"}
- AI Investment Instructions: ${prompt_text ?? "None"}

Current FINN Quality Scores:
${factorLines || "  (not available — estimate from parameters)"}
Current FINN Confidence: ${current_confidence}/100

Optimization Goal: ${goal}

Return this exact JSON shape:
{
  "changes": [
    {
      "field": "<exact field name: turnover_preference|holding_period_bias|max_position_pct|min_position_pct|cash_min_pct|cash_max_pct|prompt_text>",
      "label": "<human-readable label, e.g. 'Trading Frequency'>",
      "from": "<current value as string>",
      "to": "<new recommended value as string>",
      "reason": "<1 sentence citing numbers and why this change serves the goal>"
    }
  ],
  "score_deltas": [
    { "factor": "Risk Alignment", "before": <current score or estimate>, "after": <projected score> },
    { "factor": "Diversification", "before": <number>, "after": <number> },
    { "factor": "Tax Efficiency", "before": <number>, "after": <number> },
    { "factor": "Drawdown Resilience", "before": <number>, "after": <number> },
    { "factor": "Long-Term Compounding", "before": <number>, "after": <number> },
    { "factor": "Emotional Durability", "before": <number>, "after": <number> },
    { "factor": "Concentration Risk", "before": <number>, "after": <number> },
    { "factor": "Volatility Management", "before": <number>, "after": <number> }
  ],
  "projected_confidence": <new overall FINN Confidence score 0-100>,
  "narrative": "<2-3 sentences explaining what changed and why. Reference specific parameters. Explain the core tradeoff made.>",
  "tradeoffs": [
    "<what was sacrificed or made worse — be specific>",
    "<second tradeoff>"
  ],
  "improved_params": {
    "turnover_preference": "<only include if changed — must be exactly: Low|Moderate|High>",
    "holding_period_bias": "<only include if changed — must be exactly: Short-term|Swing|Medium-term|Long-term|Very Long-term|Flexible>",
    "max_position_pct": <number or null — only include if changed>,
    "min_position_pct": <number or null — only include if changed>,
    "cash_min_pct": <number or null — only include if changed>,
    "cash_max_pct": <number or null — only include if changed>,
    "prompt_text": "<only include if AI instructions should be updated>"
  }
}

Rules:
- Only include fields in "changes" that actually change.
- Only include fields in "improved_params" that actually change.
- "from" values must accurately reflect current parameters.
- Score deltas must be realistic — do not inflate improvements. Some factors will decline.
- projected_confidence should reflect net improvement honestly.
- tradeoffs must be real and specific — never say "no significant tradeoffs."`;

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
      max_tokens: 1800,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

    let result: ImprovementResult;
    try {
      const parsed = JSON.parse(raw) as Partial<ImprovementResult>;
      result = {
        mode,
        changes: (Array.isArray(parsed.changes) ? parsed.changes : []).map((c) => ({
          field: String(c.field ?? ""),
          label: String(c.label ?? c.field ?? ""),
          from: String(c.from ?? ""),
          to: String(c.to ?? ""),
          reason: String(c.reason ?? ""),
        })),
        score_deltas: (Array.isArray(parsed.score_deltas) ? parsed.score_deltas : []).map((d) => ({
          factor: String(d.factor ?? ""),
          before: Math.min(100, Math.max(0, Math.round(Number(d.before) || 0))),
          after: Math.min(100, Math.max(0, Math.round(Number(d.after) || 0))),
        })),
        projected_confidence: Math.min(100, Math.max(0, Math.round(Number(parsed.projected_confidence) || 0))),
        narrative: String(parsed.narrative ?? ""),
        tradeoffs: (Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : []).map(String),
        improved_params: (parsed.improved_params ?? {}) as ImprovedParams,
      };
    } catch {
      return NextResponse.json({ error: "AI returned unparseable output. Please try again." }, { status: 422 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
