import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import OpenAI from "openai";

export type ScannerBoundsSuggestion = {
  min_avg_dollar_volume: number | null;
  max_daily_move_pct: number | null;
  market_cap_floor: number | null;
  notes: string;
};

type SuggestRequest = {
  name: string;
  style: string | null;
  risk_level: string | null;
  prompt_text: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`strategies-scanner-bounds:${user.id}`, 12, 5 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let body: SuggestRequest;
  try {
    body = await req.json() as SuggestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, style, risk_level, prompt_text } = body;
  if (!prompt_text || !prompt_text.trim()) {
    return NextResponse.json({ error: "This strategy has no AI instructions to work from yet." }, { status: 400 });
  }

  const systemPrompt = `You are Atlas, an institutional trading strategy analyst. You translate a qualitative investment strategy into a small set of numeric screening bounds that an automated scanner tool can use as hard filters — WITHOUT changing what the strategy actually looks for. You are conservative: most strategies don't need numeric bounds at all, and you say so honestly rather than inventing filters that aren't implied by the text.

Respond ONLY with valid JSON. No markdown, no code fences, no explanation outside the JSON structure.`;

  const userPrompt = `Strategy: ${name}
Style: ${style ?? "Not specified"}
Risk level: ${risk_level ?? "Not specified"}

AI Investment Instructions (the actual strategy text):
"""
${prompt_text}
"""

Task: suggest numeric screening bounds ONLY if this strategy is the kind that would realistically be run through an automated scanner (e.g. it describes scanning for candidates, momentum/breakout criteria, or unattended/scheduled execution). If the strategy is a long-term buy-and-hold or discretionary style with no scanning component, return all three bound fields as null and explain why in "notes".

When bounds ARE warranted, follow these principles:
- A minimum average daily dollar volume (price × volume) is usually the right liquidity floor — NOT market cap, which is an imprecise, overly-restrictive proxy that excludes legitimate small/mid-caps on ordinary trading days.
- A cap on today's already-realized price move (e.g. "exclude names already up more than X% today") is appropriate for momentum/breakout strategies that want to avoid chasing an already-extended move, but should NOT be used for strategies explicitly seeking already-established high-momentum/hype-driven runners — read the strategy text carefully for which philosophy it holds.
- Only suggest a market cap floor if the strategy text itself explicitly cares about company size/stability (e.g. "avoid micro-caps", "blue chips only") — otherwise leave it null.
- Bounds should be loose enough that a normal, non-crashing market day still produces some candidates. Never suggest bounds so tight they'd realistically return zero matches most days.
- These are STARTING POINTS the user can edit, not precise optimized values — round to sensible numbers.

Return this exact JSON shape:
{
  "min_avg_dollar_volume": <number in dollars, e.g. 4000000, or null>,
  "max_daily_move_pct": <number as a percent, e.g. 50, or null>,
  "market_cap_floor": <number in dollars, e.g. 1000000000, or null>,
  "notes": "<2-3 sentences explaining what you suggested and why, or why you suggested no bounds at all>"
}`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await client.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 700,
      temperature: 0.2,
      ...({ reasoning_format: "hidden" } as Record<string, unknown>),
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

    let result: ScannerBoundsSuggestion;
    try {
      const parsed = JSON.parse(raw) as Partial<ScannerBoundsSuggestion>;
      result = {
        min_avg_dollar_volume: parsed.min_avg_dollar_volume != null ? Number(parsed.min_avg_dollar_volume) : null,
        max_daily_move_pct: parsed.max_daily_move_pct != null ? Number(parsed.max_daily_move_pct) : null,
        market_cap_floor: parsed.market_cap_floor != null ? Number(parsed.market_cap_floor) : null,
        notes: String(parsed.notes ?? ""),
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
