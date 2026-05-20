"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SCENARIOS = [
  { id: "tech_crash", label: "Tech selloff", description: "Technology/growth stocks drop 25%" },
  { id: "rate_spike", label: "Rate spike", description: "10-year yield jumps 100bps; rate-sensitive stocks fall 15%" },
  { id: "recession", label: "Recession", description: "Broad market falls 30%, defensive sectors outperform" },
  { id: "inflation", label: "Stagflation", description: "Inflation spikes, equities fall 20%, commodities rise" },
];

type HoldingInput = {
  ticker: string;
  company_name: string | null;
  sector?: string | null;
  market_value: number;
  weight_pct: number;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const holdings: HoldingInput[] = body.holdings ?? [];
  const totalValue: number = body.totalValue ?? 0;
  const cashBalance: number = body.cashBalance ?? 0;

  if (!holdings.length || totalValue <= 0) {
    return NextResponse.json({ error: "No holdings provided" }, { status: 400 });
  }

  const holdingsSummary = holdings
    .map((h) => `${h.ticker} (${h.company_name ?? "—"}): ${h.weight_pct.toFixed(1)}% = $${h.market_value.toLocaleString()}`)
    .join("\n");

  const cashPct = ((cashBalance / totalValue) * 100).toFixed(1);

  const prompt = `You are a portfolio risk analyst. A user wants to stress test their equity portfolio against 4 macro shock scenarios.

Portfolio overview:
Total value: $${totalValue.toLocaleString()}
Cash: $${cashBalance.toLocaleString()} (${cashPct}%)

Holdings (ticker: weight% = $value):
${holdingsSummary}

For each of the following 4 scenarios, provide a SHORT 2-3 sentence analysis:
1. Tech selloff: Technology/growth stocks fall 25%
2. Rate spike: 10-year yield +100bps, rate-sensitive names fall 15%
3. Recession: Broad market -30%, defensives outperform
4. Stagflation: Equities -20%, inflation spikes, commodities rise

For each scenario:
- Estimate the approximate portfolio impact in % and dollars (rough estimate is fine)
- Name 1-2 specific holdings most exposed
- Note any natural hedges or protective positions

Format your response EXACTLY as JSON:
{
  "scenarios": [
    {
      "id": "tech_crash",
      "label": "Tech selloff",
      "estimatedLoss": "-12%",
      "estimatedDollars": "-$4,200",
      "exposed": ["AAPL", "NVDA"],
      "hedges": ["XOM"],
      "summary": "2-3 sentence analysis..."
    },
    ... (repeat for all 4 scenarios)
  ],
  "overallRisk": "one sentence on the portfolio's biggest macro vulnerability"
}

Only respond with the JSON object. No markdown, no code blocks.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[stress-test] Gemini error:", err);
      return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const data = await res.json();
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: { scenarios: typeof SCENARIOS; overallRisk?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[stress-test] Failed to parse Gemini JSON:", cleaned.slice(0, 300));
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[stress-test] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
