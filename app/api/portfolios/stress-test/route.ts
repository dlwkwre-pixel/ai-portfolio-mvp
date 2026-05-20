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

  // Limit to top 8 by weight to keep prompt concise
  const topHoldings = [...holdings]
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, 8);

  const holdingsSummary = topHoldings
    .map((h) => `${h.ticker}: ${h.weight_pct.toFixed(1)}%`)
    .join(", ");

  const cashPct = ((cashBalance / totalValue) * 100).toFixed(1);

  const prompt = `Portfolio risk analyst. Stress test this portfolio against 4 macro scenarios. Reply with JSON only, no markdown.

Portfolio: $${totalValue.toLocaleString()} total, ${cashPct}% cash
Top holdings: ${holdingsSummary}

JSON format (all 4 scenarios + overallRisk):
{"scenarios":[{"id":"tech_crash","label":"Tech selloff","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":["TICK"],"hedges":["TICK"],"summary":"1-2 sentences"},{"id":"rate_spike","label":"Rate spike","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"},{"id":"recession","label":"Recession","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"},{"id":"inflation","label":"Stagflation","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"}],"overallRisk":"one sentence"}

Scenarios: 1) Tech selloff: growth stocks -25% 2) Rate spike: yields +100bps, rate-sensitive -15% 3) Recession: market -30%, defensives outperform 4) Stagflation: equities -20%, inflation spike`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[stress-test] Gemini error", res.status, err.slice(0, 400));
      const msg = res.status === 429 ? "Rate limited — try again in a moment" : "AI request failed";
      return NextResponse.json({ error: msg }, { status: 500 });
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
