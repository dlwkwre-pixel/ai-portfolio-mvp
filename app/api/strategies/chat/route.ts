import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a friendly financial advisor helping an investor build a personalized investing strategy.

Your job is to ask 5-7 conversational questions to understand their investing style, then generate a complete strategy.

Questions to cover (ask naturally, one at a time):
1. Main investing goal (growth, income, capital preservation, speculation)
2. Risk tolerance (how would they react to a 20% portfolio drop)
3. Trading frequency preference (buy and hold vs active trading)
4. Sector preferences or exclusions
5. Position concentration comfort (all-in on few stocks vs diversified)
6. Time horizon (when do they need this money)
7. Any specific investing philosophy they follow (value, momentum, quality, etc.)

After you have enough information (usually 5-7 exchanges), say exactly "READY_TO_GENERATE" on its own line, followed by a JSON object like this:
{
  "name": "strategy name",
  "style": "one of: Growth/Value/Blend/Dividend / Income/Quality/Index / Passive/Sector / Thematic/Momentum/Swing/Defensive/Balanced/Speculative/Custom",
  "risk_level": "one of: Conservative/Moderate/Aggressive",
  "turnover_preference": "one of: Low/Moderate/High",
  "holding_period_bias": "one of: Short-term/Swing/Medium-term/Long-term/Very Long-term/Flexible",
  "max_position_pct": number or null,
  "min_position_pct": number or null,
  "cash_min_pct": number or null,
  "cash_max_pct": number or null,
  "description": "2-3 sentence description of the strategy",
  "prompt_text": "detailed AI prompt for analyzing portfolios using this strategy (3-5 sentences covering what to prioritize, what to avoid, sizing rules, and decision criteria)"
}

Keep responses conversational and concise (2-4 sentences). Don't ask multiple questions at once. Be encouraging and professional.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI API key not configured" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 60000 });

    const completion = await client.chat.completions.create({
      model: "grok-4-fast",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Strategy chat error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
