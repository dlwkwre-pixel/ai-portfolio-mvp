import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export type LikelihoodResult = {
  rating: "very_low" | "low" | "moderate" | "high" | "very_high";
  pct: string;
  reasoning: string;
  key_drivers: string[];
  key_risks: string[];
  timeframe: string;
};

const cache = new Map<string, { data: LikelihoodResult; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      scenarioId: string;
      title: string;
      thesis: string;
      timeHorizon: string;
      signalCount: number;
      headlines: { headline: string; source: string }[];
    };

    const { scenarioId, title, thesis, timeHorizon, signalCount, headlines } = body;
    if (!title || !thesis) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const cached = cache.get(scenarioId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const groqKey = process.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY_2;
    const grokKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
    const apiKey  = groqKey ?? grokKey;
    if (!apiKey) return NextResponse.json({ error: "No AI key configured." }, { status: 503 });

    const isGrok  = !groqKey && Boolean(grokKey);
    const baseURL = isGrok ? "https://api.x.ai/v1" : "https://api.groq.com/openai/v1";
    const model   = isGrok ? "grok-3-fast" : "llama-3.3-70b-versatile";

    const headlineBlock = headlines.length > 0
      ? headlines.map((h) => `- [${h.source}] ${h.headline}`).join("\n")
      : "No current news signals for this scenario.";

    const prompt = `You are a macro investment analyst assessing how likely a scenario is to play out.

Scenario: "${title}"
Thesis: ${thesis}
Time horizon: ${timeHorizon}
Current news signal count: ${signalCount} matching headline${signalCount !== 1 ? "s" : ""}

${signalCount > 0 ? `Matching headlines:\n${headlineBlock}` : headlineBlock}

Based on current macro conditions, news signals, and historical base rates for this type of event:

Assess the probability this scenario plays out within its stated time horizon.

Respond ONLY as valid JSON (no markdown):
{
  "rating": "very_low|low|moderate|high|very_high",
  "pct": "probability range e.g. 15-25%",
  "reasoning": "2-3 sentences explaining your probability assessment with specific evidence",
  "key_drivers": ["2-3 factors that would accelerate this scenario"],
  "key_risks": ["2-3 factors that would prevent or delay it"],
  "timeframe": "specific time estimate e.g. 'likely within 3-6 weeks if signals persist'"
}`;

    const ai = new OpenAI({ apiKey, baseURL });
    const completion = await ai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();

    let result: LikelihoodResult;
    try {
      result = JSON.parse(cleaned) as LikelihoodResult;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      result = JSON.parse(match[0]) as LikelihoodResult;
    }

    cache.set(scenarioId, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Likelihood error:", err);
    return NextResponse.json({ error: "Analysis failed." }, { status: 500 });
  }
}
